import z from 'zod';

import { retrieveInitiativesOrganizations } from '@etabli/src/features/organization-read';
import { Prisma } from '@etabli/src/generated/prisma/client';
import { GetInitiativeSchema, ListInitiativesSchema } from '@etabli/src/models/actions/initiative';
import { initiativeNotFoundError } from '@etabli/src/models/entities/errors';
import { DomainReputationSchema } from '@etabli/src/models/entities/initiative';
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
  getInitiativeReputation: publicProcedure.input(GetInitiativeSchema).query(async ({ ctx, input }) => {
    const initiative = await prisma.initiative.findUnique({
      where: { id: input.id },
      select: {
        origin: {
          select: {
            RawDomainsOnInitiativeMaps: {
              orderBy: { main: 'desc' },
              select: { rawDomain: { select: { name: true } } },
            },
          },
        },
      },
    });

    if (!initiative) {
      throw initiativeNotFoundError;
    }

    const domains = initiative.origin?.RawDomainsOnInitiativeMaps.map(({ rawDomain }) => rawDomain.name) ?? [];

    // Only the reviewed columns are returned, `summary` stays internal
    const reputations = await prisma.domainReputation.findMany({
      where: { domain: { in: domains }, lastCheckAt: { not: null } },
      select: {
        domain: true,
        rank: true,
        backlinks: true,
        referringPages: true,
        referringDomains: true,
        referringDomainsNofollow: true,
        referringMainDomains: true,
        referringIps: true,
        backlinksSpamScore: true,
        brokenBacklinks: true,
        brokenPages: true,
        firstSeenAt: true,
        lastCheckAt: true,
        linksSemanticLocations: true,
        linksTypes: true,
        linksPlatformTypes: true,
        linksCountries: true,
        linksTopLevelDomains: true,
      },
    });

    // The best one first since it's the one giving the initiative its score
    reputations.sort((a, b) => (b.rank ?? -1) - (a.rank ?? -1) || domains.indexOf(a.domain) - domains.indexOf(b.domain));

    return {
      domains: z.array(DomainReputationSchema).parse(reputations),
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

      // Otherwise the order stays the relevance. The sort being stable, it remains the tiebreaker between equal scores
      if (input.orderBy.field === 'reputation') {
        const ranks = await prisma.initiative.findMany({
          where: { id: { in: filteredIds } },
          select: { id: true, reputationRank: true },
        });
        const rankById = new Map(ranks.map((initiative) => [initiative.id, initiative.reputationRank ?? -1]));

        filteredIds = [...filteredIds].sort((a, b) => (rankById.get(b) ?? -1) - (rankById.get(a) ?? -1));
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
        orderBy: input.orderBy.field === 'reputation' ? [{ reputationRank: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }] : { name: 'asc' },
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
