import { retrieveInitiativesOrganizations } from '@etabli/src/features/organization-read';
import { Prisma } from '@etabli/src/generated/prisma/client';
import { GetInitiativeSchema, ListInitiativesSchema } from '@etabli/src/models/actions/initiative';
import { initiativeNotFoundError } from '@etabli/src/models/entities/errors';
import { prisma } from '@etabli/src/prisma/client';
import { buildInitiativeFilters, searchRankedInitiativesIds } from '@etabli/src/server/routers/common/initiative-filters';
import { initiativePrismaToModel } from '@etabli/src/server/routers/mappers';
import { publicProcedure, router } from '@etabli/src/server/trpc';
import { paginate } from '@etabli/src/utils/page';

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

    const organizationsByInitiativeId = await retrieveInitiativesOrganizations([initiative.id]);

    return {
      initiative: initiativePrismaToModel({
        ...initiative,
        businessUseCases: initiative.BusinessUseCasesOnInitiatives.map((bucOnI) => bucOnI.businessUseCase.name),
        tools: initiative.ToolsOnInitiatives.map((toolOnI) => toolOnI.tool.name),
        organizations: organizationsByInitiativeId.get(initiative.id) || [],
      }),
    };
  }),
  listInitiatives: publicProcedure.input(ListInitiativesSchema).query(async ({ ctx, input }) => {
    const extraFilters = buildInitiativeFilters(input.filterBy);

    const extraWhere: Prisma.InitiativeWhereInput = extraFilters.length > 0 ? { AND: extraFilters } : {};

    const includeRelations = {
      ToolsOnInitiatives: { include: { tool: { select: { name: true } } } },
      BusinessUseCasesOnInitiatives: { include: { businessUseCase: { select: { name: true } } } },
    } satisfies Prisma.InitiativeInclude;

    if (input.filterBy.query) {
      const rankedIds = await searchRankedInitiativesIds(input.filterBy.query);

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

      // Prisma cannot order by a given list, so we re-sort in memory to preserve the relevance ranking
      // See https://github.com/prisma/prisma/issues/11336#issuecomment-1986031261
      initiatives.sort((a, b) => pageInitiativeIds.indexOf(a.id) - pageInitiativeIds.indexOf(b.id));

      const organizationsByInitiativeId = await retrieveInitiativesOrganizations(initiatives.map((initiative) => initiative.id));

      return {
        initiatives: initiatives.map((initiative) =>
          initiativePrismaToModel({
            ...initiative,
            businessUseCases: initiative.BusinessUseCasesOnInitiatives.map((bucOnI) => bucOnI.businessUseCase.name),
            tools: initiative.ToolsOnInitiatives.map((toolOnI) => toolOnI.tool.name),
            organizations: organizationsByInitiativeId.get(initiative.id) || [],
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

    const organizationsByInitiativeId = await retrieveInitiativesOrganizations(initiatives.map((initiative) => initiative.id));

    return {
      initiatives: initiatives.map((initiative) =>
        initiativePrismaToModel({
          ...initiative,
          businessUseCases: initiative.BusinessUseCasesOnInitiatives.map((bucOnI) => bucOnI.businessUseCase.name),
          tools: initiative.ToolsOnInitiatives.map((toolOnI) => toolOnI.tool.name),
          organizations: organizationsByInitiativeId.get(initiative.id) || [],
        })
      ),
      totalCount: totalCount,
    };
  }),
});
