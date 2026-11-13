import { Prisma } from '@etabli/src/generated/prisma/client';
import { prisma } from '@etabli/src/prisma';

type DatabaseClient = Prisma.TransactionClient | typeof prisma;

// Addresses are compared without their scheme, `www.` and trailing slashes, as when duplicated sheets were cleaned
const normalizedAddressSql = (column: Prisma.Sql) =>
  Prisma.sql`regexp_replace(regexp_replace(lower(${column}), '^https?://(www\\.)?', ''), '/+$', '')`;

// The domain of a website address, to compare a page of a website with the website itself
const websiteDomainSql = (column: Prisma.Sql) => Prisma.sql`split_part(${normalizedAddressSql(column)}, '/', 1)`;

export interface KnownInitiativeReplacement {
  fromInitiativeId: string;
  toInitiativeId: string;
}

// To be called right before removing sheets (in the same transaction when there is one). Each removed sheet leads to the active one
// now describing one of its websites or repositories, and the redirections that targeted a removed sheet follow it, so there is never
// more than one hop. Without any replacement its address simply does not exist anymore.
// When the caller knows the replacement (a merged map gives its sheet to the map that took its items) it is used first: the stored
// addresses of that sheet only include the merged ones once it is computed again, so comparing addresses would find nothing
export async function redirectInitiativesBeforeRemoval(
  client: DatabaseClient,
  removedInitiativesIds: string[],
  knownReplacements: KnownInitiativeReplacement[] = []
): Promise<number> {
  if (removedInitiativesIds.length === 0) {
    return 0;
  }

  const removedIds = Prisma.sql`${removedInitiativesIds}::UUID[]`;
  const removedIdsSet = new Set(removedInitiativesIds);
  // A replacement must be one of the removed sheets leading to one that stays (the target being active is checked below)
  const usableKnownReplacements = knownReplacements.filter(
    (replacement) => removedIdsSet.has(replacement.fromInitiativeId) && !removedIdsSet.has(replacement.toInitiativeId)
  );
  const knownFromIds = usableKnownReplacements.map((replacement) => replacement.fromInitiativeId);
  const knownToIds = usableKnownReplacements.map((replacement) => replacement.toInitiativeId);

  const redirected = await client.$executeRaw`
    WITH removed_address AS MATERIALIZED (
      SELECT i."id", ${normalizedAddressSql(Prisma.sql`address`)} AS "address", ${websiteDomainSql(
        Prisma.sql`address`
      )} AS "domain", true AS "isWebsite"
      FROM "Initiative" i CROSS JOIN LATERAL unnest(i."websites") AS address
      WHERE i."id" = ANY(${removedIds})
      UNION ALL
      SELECT i."id", ${normalizedAddressSql(Prisma.sql`address`)}, NULL, false
      FROM "Initiative" i CROSS JOIN LATERAL unnest(i."repositories") AS address
      WHERE i."id" = ANY(${removedIds})
    ),
    candidate_address AS MATERIALIZED (
      SELECT i."id", i."computedAt", i."originId" IS NULL AS "isOrphan", ${normalizedAddressSql(
        Prisma.sql`address`
      )} AS "address", ${websiteDomainSql(Prisma.sql`address`)} AS "domain", true AS "isWebsite"
      FROM "Initiative" i CROSS JOIN LATERAL unnest(i."websites") AS address
      WHERE i."deletedAt" IS NULL AND NOT i."id" = ANY(${removedIds})
      UNION ALL
      SELECT i."id", i."computedAt", i."originId" IS NULL, ${normalizedAddressSql(Prisma.sql`address`)}, NULL, false
      FROM "Initiative" i CROSS JOIN LATERAL unnest(i."repositories") AS address
      WHERE i."deletedAt" IS NULL AND NOT i."id" = ANY(${removedIds})
    ),
    known AS (
      SELECT DISTINCT ON (k."fromId") k."fromId", k."toId"
      FROM unnest(${knownFromIds}::UUID[], ${knownToIds}::UUID[]) AS k("fromId", "toId")
      INNER JOIN "Initiative" target ON target."id" = k."toId" AND target."deletedAt" IS NULL
      ORDER BY k."fromId"
    ),
    -- A sheet computed from a map is preferred to another old sheet still kept, then the same address to the same website domain (a sheet can list a page of a website)
    matched AS (
      SELECT DISTINCT ON (candidates."fromId") candidates."fromId", candidates."toId"
      FROM (
        SELECT removed_address."id" AS "fromId", candidate_address."id" AS "toId", candidate_address."isOrphan", 0 AS "priority", candidate_address."computedAt"
        FROM removed_address
        INNER JOIN candidate_address ON candidate_address."address" = removed_address."address"
        UNION ALL
        SELECT removed_address."id", candidate_address."id", candidate_address."isOrphan", 1, candidate_address."computedAt"
        FROM removed_address
        INNER JOIN candidate_address ON candidate_address."domain" = removed_address."domain"
        WHERE removed_address."isWebsite" AND candidate_address."isWebsite"
      ) candidates
      WHERE NOT EXISTS (SELECT 1 FROM known WHERE known."fromId" = candidates."fromId")
      ORDER BY candidates."fromId", candidates."isOrphan", candidates."priority", candidates."computedAt" DESC NULLS LAST, candidates."toId"
    ),
    replacement AS (
      SELECT "fromId", "toId" FROM known
      UNION ALL
      SELECT "fromId", "toId" FROM matched
    ),
    moved AS (
      UPDATE "InitiativeRedirection" r
      SET "toInitiativeId" = replacement."toId", "updatedAt" = now()
      FROM replacement
      WHERE r."toInitiativeId" = replacement."fromId"
    )
    INSERT INTO "InitiativeRedirection" ("fromInitiativeId", "toInitiativeId")
    SELECT "fromId", "toId" FROM replacement
    ON CONFLICT ("fromInitiativeId") DO UPDATE SET "toInitiativeId" = EXCLUDED."toInitiativeId", "updatedAt" = now()
  `;

  // Those still targeting a removed sheet had no replacement, the foreign key would remove them anyway but a soft removal would not
  await client.initiativeRedirection.deleteMany({
    where: { toInitiativeId: { in: removedInitiativesIds } },
  });

  return redirected;
}

export async function getInitiativeRedirection(initiativeId: string): Promise<{ id: string; name: string } | null> {
  const redirection = await prisma.initiativeRedirection.findUnique({
    where: { fromInitiativeId: initiativeId },
    select: { to: { select: { id: true, name: true, deletedAt: true } } },
  });

  return redirection && !redirection.to.deletedAt ? { id: redirection.to.id, name: redirection.to.name } : null;
}

// A sheet whose map was merged or removed (no origin anymore) is kept to bridge the time its websites and repositories get a new sheet,
// otherwise the product would disappear from the platform meanwhile. It is decided per sheet (not only after a complete run, which never
// happens while some maps always wait for an inventory): once each of its addresses is described by a sheet having an origin, or is no
// longer part of the sources, it is flagged as removed and its address leads to its replacement
export async function softRemoveReplacedOrphanInitiatives(client: DatabaseClient): Promise<number> {
  // Websites are compared on their domain (a sheet can list a page of a website) and repositories on their whole address
  const replacedOrphans = await client.$queryRaw<{ id: string }[]>`
    WITH covered AS MATERIALIZED (
      SELECT ${websiteDomainSql(Prisma.sql`address`)} AS "address" FROM "Initiative" i CROSS JOIN LATERAL unnest(i."websites") AS address
      WHERE i."deletedAt" IS NULL AND i."originId" IS NOT NULL
      UNION
      SELECT ${normalizedAddressSql(Prisma.sql`address`)} FROM "Initiative" i CROSS JOIN LATERAL unnest(i."repositories") AS address
      WHERE i."deletedAt" IS NULL AND i."originId" IS NOT NULL
    ),
    sourced AS MATERIALIZED (
      SELECT ${websiteDomainSql(Prisma.sql`'https://' || d."name"`)} AS "address" FROM "RawDomain" d WHERE d."deletedAt" IS NULL
      UNION
      SELECT ${normalizedAddressSql(Prisma.sql`r."repositoryUrl"`)} FROM "RawRepository" r WHERE r."deletedAt" IS NULL
    ),
    orphan AS MATERIALIZED (
      SELECT i."id", i."websites", i."repositories" FROM "Initiative" i WHERE i."deletedAt" IS NULL AND i."originId" IS NULL
    ),
    orphan_address AS MATERIALIZED (
      SELECT orphan."id", ${websiteDomainSql(Prisma.sql`address`)} AS "address" FROM orphan CROSS JOIN LATERAL unnest(orphan."websites") AS address
      UNION
      SELECT orphan."id", ${normalizedAddressSql(Prisma.sql`address`)} FROM orphan CROSS JOIN LATERAL unnest(orphan."repositories") AS address
    ),
    waiting AS (
      SELECT DISTINCT oa."id"
      FROM orphan_address oa
      WHERE EXISTS (SELECT 1 FROM sourced s WHERE s."address" = oa."address")
        AND NOT EXISTS (SELECT 1 FROM covered c WHERE c."address" = oa."address")
    )
    SELECT orphan."id" FROM orphan WHERE NOT EXISTS (SELECT 1 FROM waiting w WHERE w."id" = orphan."id")
  `;
  const replacedOrphansIds = replacedOrphans.map((orphan) => orphan.id);

  if (replacedOrphansIds.length === 0) {
    return 0;
  }

  await redirectInitiativesBeforeRemoval(client, replacedOrphansIds);

  const removed = await client.initiative.updateMany({
    where: {
      id: { in: replacedOrphansIds },
      deletedAt: null,
    },
    data: {
      deletedAt: new Date(),
    },
  });

  return removed.count;
}
