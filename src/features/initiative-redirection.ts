import { Prisma } from '@etabli/src/generated/prisma/client';
import { prisma } from '@etabli/src/prisma';

type DatabaseClient = Prisma.TransactionClient | typeof prisma;

// Addresses are compared without their scheme, `www.` and trailing slashes, as when duplicated sheets were cleaned
const normalizedAddressSql = (column: Prisma.Sql) =>
  Prisma.sql`regexp_replace(regexp_replace(lower(${column}), '^https?://(www\\.)?', ''), '/+$', '')`;

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
    WITH removed AS (
      SELECT i."id", i."websites" || i."repositories" AS "addresses"
      FROM "Initiative" i
      WHERE i."id" = ANY(${removedIds})
    ),
    known AS (
      SELECT DISTINCT ON (k."fromId") k."fromId", k."toId"
      FROM unnest(${knownFromIds}::UUID[], ${knownToIds}::UUID[]) AS k("fromId", "toId")
      INNER JOIN "Initiative" target ON target."id" = k."toId" AND target."deletedAt" IS NULL
      ORDER BY k."fromId"
    ),
    matched AS (
      SELECT DISTINCT ON (removed."id") removed."id" AS "fromId", candidate."id" AS "toId"
      FROM removed
      CROSS JOIN LATERAL unnest(removed."addresses") AS removed_address
      INNER JOIN "Initiative" candidate ON candidate."deletedAt" IS NULL
        AND NOT candidate."id" = ANY(${removedIds})
        AND EXISTS (
          SELECT 1
          FROM unnest(candidate."websites" || candidate."repositories") AS candidate_address
          WHERE ${normalizedAddressSql(Prisma.sql`candidate_address`)} = ${normalizedAddressSql(Prisma.sql`removed_address`)}
        )
      WHERE NOT EXISTS (SELECT 1 FROM known WHERE known."fromId" = removed."id")
      ORDER BY removed."id", candidate."computedAt" DESC NULLS LAST, candidate."id"
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
