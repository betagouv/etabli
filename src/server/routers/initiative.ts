import { llmManagerInstance } from '@etabli/src/features/llm';
import { Prisma } from '@etabli/src/generated/prisma/client';
import { GetInitiativeSchema, ListInitiativesSchema } from '@etabli/src/models/actions/initiative';
import { initiativeNotFoundError } from '@etabli/src/models/entities/errors';
import { prisma } from '@etabli/src/prisma/client';
import { initiativePrismaToModel } from '@etabli/src/server/routers/mappers';
import { publicProcedure, router } from '@etabli/src/server/trpc';
import { paginate } from '@etabli/src/utils/page';

// Reciprocal Rank Fusion: each ID list contributes 1/(k + rank); higher combined score wins.
// k=60 is the value from the original Cormack et al. paper, widely used as a sensible default
function reciprocalRankFusion(rankedLists: string[][], k = 60): string[] {
  const scores = new Map<string, number>();

  for (const list of rankedLists) {
    list.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    });
  }

  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

export const initiativeRouter = router({
  listTools: publicProcedure.query(async () => {
    const tools = await prisma.tool.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    return { tools };
  }),
  getInitiative: publicProcedure.input(GetInitiativeSchema).query(async ({ ctx, input }) => {
    const initiative = await prisma.initiative.findUnique({
      where: {
        id: input.id,
      },
      include: {
        ToolsOnInitiatives: {
          include: {
            tool: {
              select: {
                name: true,
              },
            },
          },
        },
        BusinessUseCasesOnInitiatives: {
          include: {
            businessUseCase: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!initiative) {
      throw initiativeNotFoundError;
    }

    return {
      initiative: initiativePrismaToModel({
        ...initiative,
        businessUseCases: initiative.BusinessUseCasesOnInitiatives.map((bucOnI) => bucOnI.businessUseCase.name),
        tools: initiative.ToolsOnInitiatives.map((toolOnI) => toolOnI.tool.name),
      }),
    };
  }),
  listInitiatives: publicProcedure.input(ListInitiativesSchema).query(async ({ ctx, input }) => {
    const extraFilters: Prisma.InitiativeWhereInput[] = [];
    if (input.filterBy.functionalUseCases && input.filterBy.functionalUseCases.length > 0) {
      extraFilters.push({ functionalUseCases: { hasSome: input.filterBy.functionalUseCases } });
    }
    if (input.filterBy.toolIds && input.filterBy.toolIds.length > 0) {
      extraFilters.push({ ToolsOnInitiatives: { some: { toolId: { in: input.filterBy.toolIds } } } });
    }
    if (input.filterBy.hasWebsite === true) {
      extraFilters.push({ NOT: { websites: { isEmpty: true } } });
    }
    if (input.filterBy.hasRepository === true) {
      extraFilters.push({ NOT: { repositories: { isEmpty: true } } });
    }

    const extraWhere: Prisma.InitiativeWhereInput = extraFilters.length > 0 ? { AND: extraFilters } : {};

    const includeRelations = {
      ToolsOnInitiatives: { include: { tool: { select: { name: true } } } },
      BusinessUseCasesOnInitiatives: { include: { businessUseCase: { select: { name: true } } } },
    } satisfies Prisma.InitiativeInclude;

    // Hybrid search: when a query is provided we combine semantic embeddings with a lexical scan and merge
    // the two ranked lists with Reciprocal Rank Fusion — exact name/keyword matches stay near the top
    // while embeddings still surface conceptually-related items.
    if (input.filterBy.query) {
      const trimmedQuery = input.filterBy.query.trim();

      const [embeddingIds, lexicalNameMatches] = await Promise.all([
        llmManagerInstance.getInitiativesFromQuery(trimmedQuery),
        prisma.initiative.findMany({
          where: { name: { contains: trimmedQuery, mode: 'insensitive' } },
          select: { id: true },
          orderBy: { name: 'asc' },
          take: 100,
        }),
      ]);
      const lexicalNameIds = lexicalNameMatches.map((m) => m.id);

      const lexicalDescriptionMatches = await prisma.initiative.findMany({
        where: {
          description: { contains: trimmedQuery, mode: 'insensitive' },
          id: { notIn: lexicalNameIds.length > 0 ? lexicalNameIds : undefined },
        },
        select: { id: true },
        orderBy: { name: 'asc' },
        take: 100,
      });
      const lexicalIds = [...lexicalNameIds, ...lexicalDescriptionMatches.map((m) => m.id)];

      const rankedIds = reciprocalRankFusion([embeddingIds, lexicalIds]);

      // Apply the extra filters to the candidate set to get the final filtered, ranked ID list — needed for
      // an accurate total count before we paginate in memory.
      let filteredIds = rankedIds;
      if (rankedIds.length > 0 && extraFilters.length > 0) {
        const kept = await prisma.initiative.findMany({
          where: { AND: [{ id: { in: rankedIds } }, extraWhere] },
          select: { id: true },
        });
        const keptSet = new Set(kept.map((k) => k.id));
        filteredIds = rankedIds.filter((id) => keptSet.has(id));
      }

      const totalCount = filteredIds.length;
      const pageInitiativeIds = paginate(filteredIds, input.pageSize, input.page);

      const initiatives = await prisma.initiative.findMany({
        where: { id: { in: pageInitiativeIds } },
        include: includeRelations,
      });

      // Prisma cannot order by a given list, so we re-sort in memory to preserve the RRF ranking
      // See https://github.com/prisma/prisma/issues/11336#issuecomment-1986031261
      initiatives.sort((a, b) => pageInitiativeIds.indexOf(a.id) - pageInitiativeIds.indexOf(b.id));

      return {
        initiatives: initiatives.map((initiative) =>
          initiativePrismaToModel({
            ...initiative,
            businessUseCases: initiative.BusinessUseCasesOnInitiatives.map((bucOnI) => bucOnI.businessUseCase.name),
            tools: initiative.ToolsOnInitiatives.map((toolOnI) => toolOnI.tool.name),
          })
        ),
        totalCount,
      };
    }

    const [initiatives, totalCount] = await prisma.$transaction([
      prisma.initiative.findMany({
        where: extraWhere,
        include: includeRelations,
        orderBy: { name: 'asc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      prisma.initiative.count({ where: extraWhere }),
    ]);

    return {
      initiatives: initiatives.map((initiative) =>
        initiativePrismaToModel({
          ...initiative,
          businessUseCases: initiative.BusinessUseCasesOnInitiatives.map((bucOnI) => bucOnI.businessUseCase.name),
          tools: initiative.ToolsOnInitiatives.map((toolOnI) => toolOnI.tool.name),
        })
      ),
      totalCount: totalCount,
    };
  }),
});
