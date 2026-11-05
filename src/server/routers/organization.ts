import { retrieveOrganizationsAncestors } from '@etabli/src/features/organization-read';
import { getReputationReferenceRank } from '@etabli/src/features/reputation-read';
import { Prisma } from '@etabli/src/generated/prisma/client';
import {
  GetOrganizationsMapSchema,
  GetOrganizationsMapSchemaType,
  GetOrganizationsSchema,
  GetToolsBreakdownSchema,
  GetToolsBreakdownSchemaType,
  ListOrganizationChildrenSchema,
  SearchOrganizationsSchema,
  allInitiativesNodeId,
  standaloneOrganizationsNodeId,
  unclassifiedInitiativesNodeId,
} from '@etabli/src/models/actions/initiative';
import {
  InitiativesCompositionSchemaType,
  InitiativesDistributionSchemaType,
  OrganizationNodeSchema,
  OrganizationNodeSchemaType,
  OrganizationOptionSchema,
  OrganizationOptionSchemaType,
  OrganizationsMapSchema,
  OrganizationsMapSchemaType,
} from '@etabli/src/models/entities/organization';
import { prisma } from '@etabli/src/prisma/client';
import { buildInitiativeFilters, retrieveFilteredInitiativesIds } from '@etabli/src/server/routers/common/initiative-filters';
import { publicProcedure, router } from '@etabli/src/server/trpc';
import { createShortLivedCache } from '@etabli/src/utils/memory-cache';
import { SUMMARY_ORGANIZATION_LEVEL } from '@etabli/src/utils/organization';
import { getRelativeReputation } from '@etabli/src/utils/reputation';
import { computeToolsBreakdown } from '@etabli/src/utils/tools-breakdown';

const organizationOptionSelect = {
  id: true,
  name: true,
  acronym: true,
  level: true,
  initiativesCount: true,
  ancestorIds: true,
} satisfies Prisma.OrganizationSelect;

type OrganizationOptionPayload = Prisma.OrganizationGetPayload<{ select: typeof organizationOptionSelect }>;

async function toOrganizationOptions(organizations: OrganizationOptionPayload[]): Promise<OrganizationOptionSchemaType[]> {
  const ancestorsById = await retrieveOrganizationsAncestors(organizations.flatMap((organization) => organization.ancestorIds));

  return organizations.map((organization) =>
    OrganizationOptionSchema.parse({
      id: organization.id,
      name: organization.name,
      acronym: organization.acronym,
      level: organization.level,
      initiativesCount: organization.initiativesCount,
      ancestors: organization.ancestorIds.flatMap((ancestorId) => {
        const ancestor = ancestorsById.get(ancestorId);

        return ancestor ? [ancestor] : [];
      }),
    })
  );
}

// Fetch organizations by identifiers while keeping the given order (Prisma cannot order by a list)
async function getOrderedOrganizationOptions(organizationsIds: string[]): Promise<OrganizationOptionPayload[]> {
  const organizations = await prisma.organization.findMany({
    where: { id: { in: organizationsIds } },
    select: organizationOptionSelect,
  });

  return organizations.sort((a, b) => organizationsIds.indexOf(a.id) - organizationsIds.indexOf(b.id));
}

// Accents, case and typographic apostrophes (the directory mixes `’` and `'`) must not matter when searching
function normalizedSql(expression: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`lower(translate(unaccent(${expression}), '’', ''''))`;
}

function normalizeQuery(value: string): string {
  return value.replace(/’/g, "'");
}

const childrenPageSize = 50;

// The directory roots are categories ("Administration centrale", "Administrations locales"...) having a deep hierarchy,
// whereas some organizations are just missing their parent in the directory and only have a few direct services
// (e.g. departmental education services), those are grouped with standalone organizations
export const isHierarchyRootSql = Prisma.sql`EXISTS (SELECT 1 FROM "Organization" d WHERE d."ancestorIds" @> ARRAY[o."id"] AND d."level" >= ${SUMMARY_ORGANIZATION_LEVEL})`;

// Computed once instead of for each organization, a root can have tens of thousands of descendants
const hierarchyRootsIdsSql = Prisma.sql`SELECT DISTINCT d."ancestorIds"[1] FROM "Organization" d WHERE d."level" >= ${SUMMARY_ORGANIZATION_LEVEL}`;

// Cache since computing the composition of the whole tree takes a bit of time, and it only changes when data is synchronized
// The cache is invalidated as soon as the data changes: a change of bindings or of what initiatives are made of updates the initiative,
// and the initiatives count refresh at the end of a binding updates organizations
let organizationsMapCache: {
  signature: string;
  value: OrganizationsMapSchemaType;
} | null = null;

let organizationsMapComputation: { signature: string; promise: Promise<OrganizationsMapSchemaType> } | null = null;

// Maps and breakdowns with criteria cannot be invalidated precisely, they are kept a few minutes so visitors sharing a link
// or going back and forth do not start the same costly queries again (the endpoints are public)
const filteredOrganizationsMapsCache = createShortLivedCache<OrganizationsMapSchemaType>({
  maximumEntries: 20, // A map holds all organizations with initiatives
  durationInMilliseconds: 5 * 60 * 1000,
});
const toolsBreakdownsCache = createShortLivedCache<{ initiativesCount: number } & ReturnType<typeof computeToolsBreakdown>>({
  maximumEntries: 200,
  durationInMilliseconds: 5 * 60 * 1000,
});

async function getOrganizationsMapSignature(): Promise<string> {
  const rows = await prisma.$queryRaw<{ signature: string }[]>`
    SELECT concat_ws(
      '|',
      (SELECT max("updatedAt")::text FROM "Organization"),
      (SELECT max("updatedAt")::text FROM "Initiative"),
      (SELECT count(*)::text FROM "OrganizationsOnInitiatives"),
      (SELECT count(*)::text FROM "Initiative" WHERE "deletedAt" IS NULL)
    ) AS "signature"
  `;

  return rows[0]?.signature ?? '';
}

interface DistributionRow {
  reputationDistribution: number[];
  foreignDistribution: number[];
  legalDistribution: number[];
}

async function computeOrganizationsMap(
  filterBy: GetOrganizationsMapSchemaType['filterBy'],
  filteredIds: string[] | null
): Promise<OrganizationsMapSchemaType> {
  const filterCondition = filteredIds ? Prisma.sql`i."id" = ANY(${filteredIds}::uuid[])` : Prisma.sql`TRUE`;
  const reputationReferenceRank = await getReputationReferenceRank();
  const stepColumn = (name: string, withoutValueCondition: Prisma.Sql = Prisma.sql`TRUE`) => Prisma.sql`
    ARRAY[
      COUNT(DISTINCT s."id") FILTER (WHERE s.${Prisma.raw(`"${name}"`)} = 1),
      COUNT(DISTINCT s."id") FILTER (WHERE s.${Prisma.raw(`"${name}"`)} = 2),
      COUNT(DISTINCT s."id") FILTER (WHERE s.${Prisma.raw(`"${name}"`)} = 3),
      COUNT(DISTINCT s."id") FILTER (WHERE s.${Prisma.raw(`"${name}"`)} = 4),
      COUNT(DISTINCT s."id") FILTER (WHERE s.${Prisma.raw(`"${name}"`)} = 5),
      COUNT(DISTINCT s."id") FILTER (WHERE s.${Prisma.raw(`"${name}"`)} IS NULL AND ${withoutValueCondition})
    ]::int[]
  `;
  const distributionColumns = Prisma.sql`
    ${stepColumn('reputationStep')} AS "reputationDistribution",
    ${stepColumn('foreignStep')} AS "foreignDistribution",
    ${stepColumn('legalStep', Prisma.sql`s."hasWebsite"`)} AS "legalDistribution"
  `;
  const compositionColumns = Prisma.sql`
    COUNT(DISTINCT s."id") FILTER (WHERE s."hasWebsite" AND NOT s."hasRepository")::int AS "websitesOnly",
    COUNT(DISTINCT s."id") FILTER (WHERE NOT s."hasWebsite" AND s."hasRepository")::int AS "repositoriesOnly",
    COUNT(DISTINCT s."id") FILTER (WHERE s."hasWebsite" AND s."hasRepository")::int AS "both"
  `;
  const scopedInitiatives = Prisma.sql`
    SELECT
      i."id",
      cardinality(i."websites") > 0 AS "hasWebsite",
      cardinality(i."repositories") > 0 AS "hasRepository",
      i."reputationRank",
      i."foreignDependencyLevel",
      CASE
        WHEN i."reputationRank" > 0 AND ${reputationReferenceRank}::DOUBLE PRECISION > 0
          THEN LEAST(GREATEST(CEIL(CEIL(i."reputationRank" / ${reputationReferenceRank}::DOUBLE PRECISION * 100) / 20), 1), 5)
      END AS "reputationStep",
      CASE i."foreignDependencyLevel" WHEN 0 THEN 1 WHEN 1 THEN 2 WHEN 2 THEN 4 WHEN 3 THEN 5 END AS "foreignStep",
      i."hasLegalNotice",
      CASE i."hasLegalNotice" WHEN TRUE THEN 5 WHEN FALSE THEN 1 END AS "legalStep"
    FROM "Initiative" i
    WHERE i."deletedAt" IS NULL AND ${filterCondition}
  `;

  // Filtering on organizations must not bring their co-owners on the map (an initiative can also be bound elsewhere)
  const selectedOrganizationIds = filterBy.organizationIds ?? [];
  const bindings =
    selectedOrganizationIds.length > 0
      ? Prisma.sql`(
          SELECT oi.*
          FROM "OrganizationsOnInitiatives" oi
          JOIN "Organization" o ON o."id" = oi."organizationId"
          WHERE o."id" = ANY(${selectedOrganizationIds}::uuid[]) OR o."ancestorIds" && ${selectedOrganizationIds}::uuid[]
        )`
      : Prisma.sql`"OrganizationsOnInitiatives"`;

  const [ownRows, subtreeRows, overallRows, standaloneRows, hierarchyRoots] = await Promise.all([
    // Initiatives directly bound to each organization, with their weight (shared between the organizations of an initiative)
    prisma.$queryRaw<
      (InitiativesCompositionSchemaType & { id: string; websitesOnlyWeight: number; repositoriesOnlyWeight: number; bothWeight: number })[]
    >`
      WITH scoped AS (${scopedInitiatives}),
      s AS (
        SELECT oi."organizationId", scoped.*, 1.0 / COUNT(*) OVER (PARTITION BY scoped."id") AS "weight"
        FROM scoped
        JOIN ${bindings} oi ON oi."initiativeId" = scoped."id"
      )
      SELECT
        s."organizationId" AS "id",
        ${compositionColumns},
        COALESCE(SUM(s."weight") FILTER (WHERE s."hasWebsite" AND NOT s."hasRepository"), 0)::float AS "websitesOnlyWeight",
        COALESCE(SUM(s."weight") FILTER (WHERE NOT s."hasWebsite" AND s."hasRepository"), 0)::float AS "repositoriesOnlyWeight",
        COALESCE(SUM(s."weight") FILTER (WHERE s."hasWebsite" AND s."hasRepository"), 0)::float AS "bothWeight"
      FROM s
      GROUP BY s."organizationId"
    `,
    // Distinct initiatives of each organization and its descendants
    prisma.$queryRaw<
      (InitiativesCompositionSchemaType &
        DistributionRow & {
          id: string;
          medianReputationRank: number | null;
          averageForeignDependencyLevel: number | null;
          legalNoticeShare: number | null;
        })[]
    >`
      WITH s AS (${scopedInitiatives})
      SELECT
        target."id",
        ${compositionColumns},
        ${distributionColumns},
        percentile_cont(0.5) WITHIN GROUP (ORDER BY s."reputationRank") FILTER (WHERE s."reputationRank" > 0) AS "medianReputationRank",
        AVG(s."foreignDependencyLevel")::float AS "averageForeignDependencyLevel",
        AVG(CASE s."hasLegalNotice" WHEN TRUE THEN 100.0 WHEN FALSE THEN 0.0 END)::float AS "legalNoticeShare"
      FROM s
      JOIN ${bindings} oi ON oi."initiativeId" = s."id"
      JOIN "Organization" bound ON bound."id" = oi."organizationId"
      CROSS JOIN LATERAL unnest(array_append(bound."ancestorIds", bound."id")) AS target("id")
      GROUP BY target."id"
    `,
    prisma.$queryRaw<(InitiativesCompositionSchemaType & DistributionRow & { unclassified: boolean })[]>`
      WITH s AS (
        SELECT
          scoped.*,
          NOT EXISTS (SELECT 1 FROM "OrganizationsOnInitiatives" oi WHERE oi."initiativeId" = scoped."id") AS "unclassified"
        FROM (${scopedInitiatives}) scoped
      )
      SELECT s."unclassified", ${compositionColumns}, ${distributionColumns}
      FROM s
      GROUP BY s."unclassified"
    `,
    prisma.$queryRaw<(InitiativesCompositionSchemaType & DistributionRow)[]>`
      WITH s AS (${scopedInitiatives})
      SELECT ${compositionColumns}, ${distributionColumns}
      FROM s
      JOIN ${bindings} oi ON oi."initiativeId" = s."id"
      JOIN "Organization" o ON o."id" = oi."organizationId"
      WHERE coalesce(o."ancestorIds"[1], o."id") NOT IN (${hierarchyRootsIdsSql})
    `,
    // Same definition as for browsing the tree in filters
    prisma.$queryRaw<{ id: string }[]>`
      SELECT o."id"
      FROM "Organization" o
      WHERE o."level" = 1 AND o."initiativesCount" > 0 AND ${isHierarchyRootSql}
    `,
  ]);

  const organizations = await prisma.organization.findMany({
    where: { initiativesCount: { gt: 0 } },
    select: { id: true, parentOrganizationId: true, name: true, acronym: true, level: true, isTerritorial: true },
  });

  const toComposition = (row?: InitiativesCompositionSchemaType): InitiativesCompositionSchemaType => ({
    websitesOnly: row?.websitesOnly ?? 0,
    repositoriesOnly: row?.repositoriesOnly ?? 0,
    both: row?.both ?? 0,
  });

  const ownById = new Map(ownRows.map((row) => [row.id, row]));
  const subtreeById = new Map(subtreeRows.map((row) => [row.id, row]));
  const hierarchyRootsIds = new Set(hierarchyRoots.map((hierarchyRoot) => hierarchyRoot.id));
  const classified = toComposition(overallRows.find((row) => !row.unclassified));
  const unclassified = toComposition(overallRows.find((row) => row.unclassified));

  const toDistribution = (row?: DistributionRow): InitiativesDistributionSchemaType => ({
    reputation: row?.reputationDistribution ?? [0, 0, 0, 0, 0, 0],
    foreign: row?.foreignDistribution ?? [0, 0, 0, 0, 0, 0],
    legal: row?.legalDistribution ?? [0, 0, 0, 0, 0, 0],
  });
  const classifiedDistribution = toDistribution(overallRows.find((row) => !row.unclassified));
  const unclassifiedDistribution = toDistribution(overallRows.find((row) => row.unclassified));
  const sum = (a: number[], b: number[]) => a.map((value, index) => value + b[index]);

  const value = OrganizationsMapSchema.parse({
    // Organizations without any matching initiative are not part of the map
    organizations: organizations.flatMap((organization) => {
      const subtree = subtreeById.get(organization.id);
      if (!subtree) {
        return [];
      }

      const own = ownById.get(organization.id);

      return [
        {
          id: organization.id,
          parentId: organization.parentOrganizationId,
          name: organization.name,
          acronym: organization.acronym,
          level: organization.level,
          isHierarchyRoot: hierarchyRootsIds.has(organization.id),
          isTerritorial: organization.isTerritorial,
          composition: toComposition(subtree),
          own: toComposition(own),
          ownWeights: {
            websitesOnly: own?.websitesOnlyWeight ?? 0,
            repositoriesOnly: own?.repositoriesOnlyWeight ?? 0,
            both: own?.bothWeight ?? 0,
          },
          relativeReputation: getRelativeReputation(subtree.medianReputationRank, reputationReferenceRank),
          averageForeignDependencyLevel: subtree.averageForeignDependencyLevel,
          legalNoticeShare: subtree.legalNoticeShare,
          distribution: toDistribution(subtree),
        },
      ];
    }),
    composition: {
      websitesOnly: classified.websitesOnly + unclassified.websitesOnly,
      repositoriesOnly: classified.repositoriesOnly + unclassified.repositoriesOnly,
      both: classified.both + unclassified.both,
    },
    standalone: toComposition(standaloneRows[0]),
    unclassified: unclassified,
    distribution: {
      reputation: sum(classifiedDistribution.reputation, unclassifiedDistribution.reputation),
      foreign: sum(classifiedDistribution.foreign, unclassifiedDistribution.foreign),
      legal: sum(classifiedDistribution.legal, unclassifiedDistribution.legal),
    },
    standaloneDistribution: toDistribution(standaloneRows[0]),
    unclassifiedDistribution: unclassifiedDistribution,
  });

  // An empty result means the organizations are being synchronized, it must not be kept
  return value;
}

export const organizationRouter = router({
  searchOrganizations: publicProcedure.input(SearchOrganizationsSchema).query(async ({ input }) => {
    const maximumResults = 30;
    const words = normalizeQuery(input.query || '')
      .trim()
      .split(/\s+/)
      .filter((word) => word !== '')
      .slice(0, 10)
      .map((word) => word.replace(/[\\%_]/g, '\\$&')); // Escape `LIKE` wildcards since it is user input

    let organizationsIds: string[];
    const matchedThrough: Record<string, string[]> = {}; // For a result only found through organizations without initiatives under it, their names
    if (words.length === 0) {
      // Without query we suggest the most represented organizations, skipping generic upper levels of the directory
      const organizations = await prisma.organization.findMany({
        where: {
          initiativesCount: { gt: 0 },
          level: { gte: SUMMARY_ORGANIZATION_LEVEL },
        },
        select: { id: true },
        orderBy: [{ initiativesCount: 'desc' }, { name: 'asc' }],
        take: maximumResults,
      });

      organizationsIds = organizations.map((organization) => organization.id);
    } else {
      // Each word must be found in the name, the acronym or a declared domain (so `beta.gouv.fr` finds teams declaring it).
      // A matching organization without initiatives is replaced by its closest meaningful ancestor having some, since
      // initiatives are often bound to the parent (e.g. teams sharing the same website are bound to their department)
      const searchableText = normalizedSql(Prisma.sql`o."name" || ' ' || coalesce(o."acronym", '') || ' ' || array_to_string(o."domains", ' ')`);
      const conditions = words.map((word) => Prisma.sql`${searchableText} LIKE lower(unaccent(${`%${word}%`}))`);
      const fullQuery = words.join(' ');

      const rows = await prisma.$queryRaw<{ id: string; matchedThrough: string[] | null }[]>`
        WITH matched AS (
          SELECT
            o."id",
            o."name",
            o."ancestorIds",
            o."initiativesCount" > 0 AS "isDirect",
            ${normalizedSql(Prisma.sql`coalesce(o."acronym", '')`)} = lower(unaccent(${fullQuery})) AS "isExactAcronym",
            ${normalizedSql(Prisma.sql`o."name"`)} LIKE lower(unaccent(${`${fullQuery}%`})) AS "isNamePrefix"
          FROM "Organization" o
          -- Organizations without initiatives are only useful through a meaningful ancestor, which excludes thousands of
          -- standalone ones (town halls...) early and keeps the text matching cheap
          WHERE (o."initiativesCount" > 0 OR (o."level" > ${SUMMARY_ORGANIZATION_LEVEL} AND NOT o."isTerritorial")) AND ${Prisma.join(
            conditions,
            ' AND '
          )}
        ),
        resolved AS (
          SELECT
            CASE
              WHEN m."isDirect" THEN m."id"
              ELSE (
                SELECT a."id"
                FROM unnest(m."ancestorIds") WITH ORDINALITY AS ancestor("id", "position")
                JOIN "Organization" a ON a."id" = ancestor."id"
                WHERE a."initiativesCount" > 0 AND a."level" >= ${SUMMARY_ORGANIZATION_LEVEL}
                ORDER BY ancestor."position" DESC
                LIMIT 1
              )
            END AS "id",
            m."name" AS "matchedName",
            m."isDirect",
            m."isExactAcronym",
            m."isNamePrefix"
          FROM matched m
        )
        SELECT
          r."id",
          CASE WHEN bool_or(r."isDirect") THEN NULL ELSE array_agg(r."matchedName" ORDER BY r."matchedName") END AS "matchedThrough"
        FROM resolved r
        JOIN "Organization" o ON o."id" = r."id"
        GROUP BY r."id", o."initiativesCount", o."name"
        ORDER BY
          bool_or(r."isExactAcronym" AND r."isDirect") DESC,
          bool_or(r."isNamePrefix" AND r."isDirect") DESC,
          bool_or(r."isDirect") DESC,
          o."initiativesCount" DESC,
          o."name" ASC
        LIMIT ${maximumResults}
      `;

      organizationsIds = rows.map((row) => row.id);

      for (const row of rows) {
        if (row.matchedThrough) {
          matchedThrough[row.id] = row.matchedThrough;
        }
      }
    }

    return {
      organizations: await toOrganizationOptions(await getOrderedOrganizationOptions(organizationsIds)),
      matchedThrough: matchedThrough,
    };
  }),
  getOrganizations: publicProcedure.input(GetOrganizationsSchema).query(async ({ input }) => {
    const organizations = await prisma.organization.findMany({
      where: { id: { in: input.ids } },
      select: organizationOptionSelect,
      orderBy: { name: 'asc' },
    });

    return {
      organizations: await toOrganizationOptions(organizations),
    };
  }),
  listOrganizationChildren: publicProcedure.input(ListOrganizationChildrenSchema).query(async ({ input }) => {
    // Only organizations having initiatives are browsable, the most represented first
    let where: Prisma.Sql;
    if (input.parentId === null) {
      // Top of the tree: roots of the hierarchy (standalone organizations are grouped into a virtual node below)
      where = Prisma.sql`o."level" = 1 AND ${isHierarchyRootSql}`;
    } else if (input.parentId === standaloneOrganizationsNodeId) {
      where = Prisma.sql`o."level" = 1 AND NOT ${isHierarchyRootSql}`;
    } else {
      where = Prisma.sql`o."parentOrganizationId" = ${input.parentId}::uuid`;
    }

    const [rows, totalRows] = await Promise.all([
      prisma.$queryRaw<{ id: string; hasChildren: boolean }[]>`
        SELECT
          o."id",
          EXISTS (SELECT 1 FROM "Organization" c WHERE c."parentOrganizationId" = o."id" AND c."initiativesCount" > 0) AS "hasChildren"
        FROM "Organization" o
        WHERE o."initiativesCount" > 0 AND ${where}
        ORDER BY o."initiativesCount" DESC, o."name" ASC, o."id" ASC -- the identifier makes the order stable across pages
        OFFSET ${input.offset}
        LIMIT ${childrenPageSize}
      `,
      prisma.$queryRaw<{ total: number }[]>`
        SELECT COUNT(*)::int AS "total"
        FROM "Organization" o
        WHERE o."initiativesCount" > 0 AND ${where}
      `,
    ]);

    const hasChildrenById = new Map(rows.map((row) => [row.id, row.hasChildren]));
    const options = await toOrganizationOptions(await getOrderedOrganizationOptions(rows.map((row) => row.id)));

    const organizations: OrganizationNodeSchemaType[] = options.map((option) =>
      OrganizationNodeSchema.parse({
        ...option,
        hasChildren: hasChildrenById.get(option.id) === true,
      })
    );

    let standaloneOrganizationsCount: number | null = null;
    let unclassifiedInitiativesCount: number | null = null;
    if (input.parentId === null) {
      const [standaloneRows, unclassifiedCount] = await Promise.all([
        prisma.$queryRaw<{ total: number }[]>`
          SELECT COUNT(*)::int AS "total"
          FROM "Organization" o
          WHERE o."initiativesCount" > 0 AND o."level" = 1 AND NOT ${isHierarchyRootSql}
        `,
        prisma.initiative.count({
          where: {
            deletedAt: null,
            OrganizationsOnInitiatives: { none: {} },
          },
        }),
      ]);

      standaloneOrganizationsCount = standaloneRows[0]?.total ?? 0;
      unclassifiedInitiativesCount = unclassifiedCount;
    }

    return {
      organizations: organizations,
      total: totalRows[0]?.total ?? 0,
      pageSize: childrenPageSize,
      standaloneOrganizationsCount: standaloneOrganizationsCount,
      unclassifiedInitiativesCount: unclassifiedInitiativesCount,
    };
  }),
  getToolsBreakdown: publicProcedure.input(GetToolsBreakdownSchema).query(async ({ input }) => {
    return await toolsBreakdownsCache(JSON.stringify(input), () => computeToolsBreakdownForNode(input));
  }),
  getOrganizationsMap: publicProcedure.input(GetOrganizationsMapSchema).query(async ({ input }) => {
    // Only the map without criteria is kept until the data changes, it is the one displayed the most
    const hasCriterion = !!input.filterBy.query || buildInitiativeFilters(input.filterBy).length > 0;
    if (hasCriterion) {
      return await filteredOrganizationsMapsCache(JSON.stringify(input.filterBy), async () => {
        return await computeOrganizationsMap(input.filterBy, await retrieveFilteredInitiativesIds(input.filterBy));
      });
    }

    const signature = await getOrganizationsMapSignature();

    if (organizationsMapCache?.signature === signature) {
      return organizationsMapCache.value;
    }

    // It takes seconds to compute, so visitors arriving meanwhile wait for the same result instead of each starting a computation
    if (organizationsMapComputation?.signature !== signature) {
      const promise: Promise<OrganizationsMapSchemaType> = computeOrganizationsMap(input.filterBy, null)
        .then((value) => {
          if (value.organizations.length > 0) {
            organizationsMapCache = { signature: signature, value: value };
          }

          return value;
        })
        .finally(() => {
          // A newer computation (the data changed meanwhile) may have replaced this one, it must not be forgotten
          if (organizationsMapComputation?.promise === promise) {
            organizationsMapComputation = null;
          }
        });

      organizationsMapComputation = { signature: signature, promise: promise };
    }

    return await organizationsMapComputation.promise;
  }),
});

async function computeToolsBreakdownForNode(input: GetToolsBreakdownSchemaType) {
  const maximumTools = 8;

  // The initiatives of the map node (an organization includes its descendants)
  let scope: Prisma.Sql;
  if (input.nodeId === allInitiativesNodeId) {
    scope = Prisma.sql`TRUE`;
  } else if (input.nodeId === unclassifiedInitiativesNodeId) {
    scope = Prisma.sql`NOT EXISTS (SELECT 1 FROM "OrganizationsOnInitiatives" oi WHERE oi."initiativeId" = i."id")`;
  } else {
    const organizationCondition =
      input.nodeId === standaloneOrganizationsNodeId
        ? Prisma.sql`coalesce(o."ancestorIds"[1], o."id") NOT IN (${hierarchyRootsIdsSql})`
        : Prisma.sql`o."id" = ${input.nodeId}::uuid OR o."ancestorIds" @> ARRAY[${input.nodeId}::uuid]`;

    scope = Prisma.sql`EXISTS (
        SELECT 1
        FROM "OrganizationsOnInitiatives" oi
        JOIN "Organization" o ON o."id" = oi."organizationId"
        WHERE oi."initiativeId" = i."id" AND (${organizationCondition})
      )`;
  }

  const filteredIds = await retrieveFilteredInitiativesIds(input.filterBy);
  const filterCondition = filteredIds ? Prisma.sql`i."id" = ANY(${filteredIds}::uuid[])` : Prisma.sql`TRUE`;

  // An initiative counts fully for each of its tools (using 2 frameworks does not make it half a user of each)
  const scopedTools = Prisma.sql`
      WITH scoped AS (
        SELECT i."id" FROM "Initiative" i WHERE i."deletedAt" IS NULL AND ${filterCondition} AND ${scope}
      ),
      used AS (
        SELECT t."name", ti."initiativeId"
        FROM "ToolsOnInitiatives" ti
        JOIN "Tool" t ON t."id" = ti."toolId"
        JOIN scoped s ON s."id" = ti."initiativeId"
        WHERE t."category" = ${input.category}::"ToolCategory"
      ),
      listed AS (
        SELECT u."name", COUNT(DISTINCT u."initiativeId")::int AS "initiativesCount"
        FROM used u
        GROUP BY u."name"
        ORDER BY "initiativesCount" DESC, u."name" ASC
        LIMIT ${maximumTools}
      )
    `;

  const [rows, usages, counts] = await Promise.all([
    prisma.$queryRaw<{ name: string; initiativesCount: number }[]>`
        ${scopedTools}
        SELECT l."name", l."initiativesCount" FROM listed l ORDER BY l."initiativesCount" DESC, l."name" ASC
      `,
    prisma.$queryRaw<{ covered: number; others: number }[]>`
        ${scopedTools}
        SELECT
          COUNT(DISTINCT u."initiativeId")::int AS "covered",
          COUNT(DISTINCT u."initiativeId") FILTER (WHERE u."name" NOT IN (SELECT l."name" FROM listed l))::int AS "others"
        FROM used u
      `,
    prisma.$queryRaw<{ total: number }[]>`
        SELECT COUNT(*)::int AS "total" FROM "Initiative" i WHERE i."deletedAt" IS NULL AND ${filterCondition} AND ${scope}
      `,
  ]);

  const initiativesCount = counts[0]?.total ?? 0;

  return {
    initiativesCount: initiativesCount,
    ...computeToolsBreakdown(rows, {
      initiativesCount: initiativesCount,
      initiativesWithToolCount: usages[0]?.covered ?? 0,
      initiativesWithOtherToolCount: usages[0]?.others ?? 0,
    }),
  };
}
