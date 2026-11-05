import { Prisma } from '@etabli/src/generated/prisma/client';
import { prisma } from '@etabli/src/prisma/client';
import { reputationReferencePercentile } from '@etabli/src/utils/reputation';

// The percentile sorts the whole table, whereas it only moves when the reputation pass runs (a few times a month). The listing
// and each sheet need it, so the value is kept a few minutes (shared while being computed) instead of being computed per request
const referenceRankCacheDurationInMilliseconds = 10 * 60 * 1000;
let referenceRankCache: { value: Promise<number | null>; expiresAt: number } | null = null;

async function queryReputationReferenceRank(client: Pick<Prisma.TransactionClient, '$queryRaw'>): Promise<number | null> {
  const [{ referenceRank }] = await client.$queryRaw<{ referenceRank: number | null }[]>`
    SELECT percentile_cont(${reputationReferencePercentile}::DOUBLE PRECISION) WITHIN GROUP (ORDER BY "reputationRank") AS "referenceRank"
    FROM "Initiative"
    WHERE "deletedAt" IS NULL AND "reputationRank" > 0
  `;

  return referenceRank;
}

// Kept apart from `domain-reputation.ts` so reading it from the API does not load the whole queueing and LLM stack
export async function getReputationReferenceRank(client?: Pick<Prisma.TransactionClient, '$queryRaw'>): Promise<number | null> {
  // A given client (a transaction) must see its own data, so it is never cached
  if (client) {
    return await queryReputationReferenceRank(client);
  }

  if (!referenceRankCache || referenceRankCache.expiresAt <= Date.now()) {
    const value = queryReputationReferenceRank(prisma);

    referenceRankCache = { value: value, expiresAt: Date.now() + referenceRankCacheDurationInMilliseconds };

    // A failure must not be served until the expiration
    value.catch(() => {
      if (referenceRankCache?.value === value) {
        referenceRankCache = null;
      }
    });
  }

  return await referenceRankCache.value;
}
