import z from 'zod';

import { retrieveInitiativesOrganizations } from '@etabli/src/features/organization-read';
import { getReputationReferenceRank } from '@etabli/src/features/reputation-read';
import { Prisma } from '@etabli/src/generated/prisma/client';
import { GetInitiativeSchema, ListInitiativesSchema } from '@etabli/src/models/actions/initiative';
import { initiativeNotFoundError } from '@etabli/src/models/entities/errors';
import { DomainReputationSchema } from '@etabli/src/models/entities/initiative';
import { prisma } from '@etabli/src/prisma/client';
import { buildInitiativeFilters, searchRankedInitiativesIds } from '@etabli/src/server/routers/common/initiative-filters';
import { initiativePrismaToModel } from '@etabli/src/server/routers/mappers';
import { publicProcedure, router } from '@etabli/src/server/trpc';
import { paginate } from '@etabli/src/utils/page';
import { getRelativeReputation } from '@etabli/src/utils/reputation';

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
    const reputationReferenceRank = await getReputationReferenceRank();
    const rawRepositories = await prisma.rawRepository.findMany({
      where: { repositoryUrl: { in: initiative.repositories }, starsCount: { gt: 0 } },
      select: { repositoryUrl: true, starsCount: true },
    });

    return {
      repositoriesStars: Object.fromEntries(rawRepositories.map(({ repositoryUrl, starsCount }) => [repositoryUrl, starsCount])) as Record<
        string,
        number
      >,
      initiative: initiativePrismaToModel({
        ...initiative,
        businessUseCases: initiative.BusinessUseCasesOnInitiatives.map((bucOnI) => bucOnI.businessUseCase.name),
        tools: initiative.ToolsOnInitiatives.map((toolOnI) => toolOnI.tool.name),
        organizations: organizationsByInitiativeId.get(initiative.id) || [],
        reputationReferenceRank: reputationReferenceRank,
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

    // Only the grades are public, the detail of failing tests would be a list of weaknesses to exploit
    const [reputationReferenceRank, httpSecurities, mailSecurities, sovereignties, rawDomains] = await Promise.all([
      getReputationReferenceRank(),
      prisma.domainHttpSecurity.findMany({ where: { domain: { in: domains } }, select: { domain: true, grade: true } }),
      prisma.domainMailSecurity.findMany({ where: { domain: { in: domains } }, select: { domain: true, usesMail: true, level: true, issues: true } }),
      prisma.domainSovereignty.findMany({ where: { domain: { in: domains } }, select: { domain: true, level: true, dependencies: true } }),
      prisma.rawDomain.findMany({
        where: { name: { in: domains } },
        select: { name: true, websiteHasLegalNotice: true, websiteHasPrivacyPolicy: true, tlsLevel: true, tlsIssues: true },
      }),
    ]);
    const httpSecurityGrades = new Map(httpSecurities.map(({ domain, grade }) => [domain, grade]));
    const mailSecuritiesByDomain = new Map(mailSecurities.map((mailSecurity) => [mailSecurity.domain, mailSecurity]));
    const sovereigntiesByDomain = new Map(sovereignties.map((sovereignty) => [sovereignty.domain, sovereignty]));
    const rawDomainsByName = new Map(rawDomains.map((rawDomain) => [rawDomain.name, rawDomain]));

    // The best one first since it's the one giving the initiative its score
    reputations.sort((a, b) => (b.rank ?? -1) - (a.rank ?? -1) || domains.indexOf(a.domain) - domains.indexOf(b.domain));

    return {
      domains: z.array(DomainReputationSchema).parse(
        reputations.map((reputation) => ({
          ...reputation,
          relativeReputation: getRelativeReputation(reputation.rank, reputationReferenceRank),
          httpSecurityGrade: httpSecurityGrades.get(reputation.domain) ?? null,
          tlsLevel: rawDomainsByName.get(reputation.domain)?.tlsLevel ?? null,
          tlsIssues: rawDomainsByName.get(reputation.domain)?.tlsIssues ?? [],
          usesMail: mailSecuritiesByDomain.get(reputation.domain)?.usesMail ?? null,
          mailSecurityLevel: mailSecuritiesByDomain.get(reputation.domain)?.level ?? null,
          mailIssues: mailSecuritiesByDomain.get(reputation.domain)?.issues ?? [],
          hasLegalNotice: rawDomainsByName.get(reputation.domain)?.websiteHasLegalNotice ?? null,
          hasPrivacyPolicy: rawDomainsByName.get(reputation.domain)?.websiteHasPrivacyPolicy ?? null,
          foreignDependencyLevel: sovereigntiesByDomain.get(reputation.domain)?.level ?? null,
          foreignDependencies: sovereigntiesByDomain.get(reputation.domain)?.dependencies ?? [],
          backlinks: reputation.backlinks === null ? null : Number(reputation.backlinks),
          referringPages: reputation.referringPages === null ? null : Number(reputation.referringPages),
          brokenBacklinks: reputation.brokenBacklinks === null ? null : Number(reputation.brokenBacklinks),
          brokenPages: reputation.brokenPages === null ? null : Number(reputation.brokenPages),
        }))
      ),
    };
  }),
  listInitiatives: publicProcedure.input(ListInitiativesSchema).query(async ({ ctx, input }) => {
    const extraFilters = buildInitiativeFilters(input.filterBy);
    const reputationReferenceRank = await getReputationReferenceRank();

    const extraWhere: Prisma.InitiativeWhereInput = { deletedAt: null, ...(extraFilters.length > 0 ? { AND: extraFilters } : {}) };

    const includeRelations = {
      ToolsOnInitiatives: { include: { tool: { select: { name: true } } } },
      BusinessUseCasesOnInitiatives: { include: { businessUseCase: { select: { name: true } } } },
    } satisfies Prisma.InitiativeInclude;

    if (input.filterBy.query) {
      const rankedIds = await searchRankedInitiativesIds(input.filterBy.query);

      // The search only returns active sheets, the other criteria and the sort apply to them in a single query (none when
      // they are not needed), the total count needs them all before paginating in memory
      let filteredIds = rankedIds;
      if (rankedIds.length > 0 && (extraFilters.length > 0 || input.orderBy.field === 'name' || input.orderBy.field === 'reputation')) {
        const candidates = await prisma.initiative.findMany({
          where: { AND: [{ id: { in: rankedIds } }, ...extraFilters] },
          select: { id: true, reputationRank: true },
          ...(input.orderBy.field === 'name' ? { orderBy: { name: 'asc' } } : {}),
        });

        if (input.orderBy.field === 'name') {
          filteredIds = candidates.map((initiative) => initiative.id);
        } else {
          const rankById = new Map(candidates.map((initiative) => [initiative.id, initiative.reputationRank ?? -1]));

          filteredIds = rankedIds.filter((id) => rankById.has(id));

          if (input.orderBy.field === 'reputation') {
            // The sort being stable, the relevance remains the tiebreaker between equal scores
            filteredIds.sort((a, b) => (rankById.get(b) ?? -1) - (rankById.get(a) ?? -1));
          }
        }
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
            reputationReferenceRank: reputationReferenceRank,
          })
        ),
        totalCount,
      };
    }

    const [initiatives, totalCount] = await prisma.$transaction([
      prisma.initiative.findMany({
        where: extraWhere,
        include: includeRelations,
        // Without any searched text there is nothing to be relevant to, so what is the most known comes first
        orderBy: input.orderBy.field === 'name' ? { name: 'asc' } : [{ reputationRank: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }],
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
          reputationReferenceRank: reputationReferenceRank,
        })
      ),
      totalCount: totalCount,
    };
  }),
});
