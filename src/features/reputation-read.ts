import { Prisma } from '@etabli/src/generated/prisma/client';
import { prisma } from '@etabli/src/prisma/client';
import { reputationReferencePercentile } from '@etabli/src/utils/reputation';

// Kept apart from `domain-reputation.ts` so reading it from the API does not load the whole queueing and LLM stack
export async function getReputationReferenceRank(client: Pick<Prisma.TransactionClient, '$queryRaw'> = prisma): Promise<number | null> {
  const [{ referenceRank }] = await client.$queryRaw<{ referenceRank: number | null }[]>`
    SELECT percentile_cont(${reputationReferencePercentile}::DOUBLE PRECISION) WITHIN GROUP (ORDER BY "reputationRank") AS "referenceRank"
    FROM "Initiative"
    WHERE "deletedAt" IS NULL AND "reputationRank" > 0
  `;

  return referenceRank;
}
