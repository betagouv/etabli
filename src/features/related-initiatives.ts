import { Prisma } from '@etabli/src/generated/prisma/client';
import { RelatedInitiative } from '@etabli/src/utils/related-initiatives';

// Enough for the tooltip of a card, without sending whole descriptions in the page
const descriptionLength = 280;

// Other sheets of an organization worth suggesting first: a website is a service people can use, then repositories still alive (not archived
// nor a fork, which is mostly a copy of someone else's work), and only then the others. The reputation orders each of these groups, and
// ties are broken on the name and the identifier so a sheet always shows the same ones
export async function getRelatedInitiatives(
  client: Pick<Prisma.TransactionClient, '$queryRaw'>,
  initiativeId: string,
  organizationId: string,
  limit: number
): Promise<RelatedInitiative[]> {
  return await client.$queryRaw<RelatedInitiative[]>`
    SELECT i."id", i."name", CASE WHEN length(i."description") > ${descriptionLength} THEN left(i."description", ${descriptionLength} - 1) || '…' ELSE i."description" END AS "description", i."websites", i."repositories"
    FROM "Initiative" i
    WHERE i."deletedAt" IS NULL
      AND i."id" != ${initiativeId}::uuid
      AND EXISTS (
        SELECT 1
        FROM "OrganizationsOnInitiatives" o
        WHERE o."initiativeId" = i."id" AND o."organizationId" = ${organizationId}::uuid
      )
    ORDER BY
      cardinality(i."websites") > 0 DESC,
      EXISTS (
        SELECT 1
        FROM "RawRepository" r
        WHERE r."repositoryUrl" = ANY(i."repositories") AND r."isArchived" = false AND r."isFork" IS NOT TRUE
      ) DESC,
      i."reputationRank" DESC NULLS LAST,
      i."name" ASC,
      i."id" ASC
    LIMIT ${limit}
  `;
}
