import z from 'zod';

import { updateInitiativesIndicators } from '@etabli/src/features/initiative-indicators';
import { Prisma } from '@etabli/src/generated/prisma/client';
import { prisma } from '@etabli/src/prisma';
import { watchGracefulExitInLoop } from '@etabli/src/server/system';

// The service is free and has no key, a host is scanned at most once per minute and a recent result is returned otherwise (ref: https://github.com/mdn/mdn-http-observatory)
export const observatoryAnalyzeUrl = 'https://observatory-api.mdn.mozilla.net/api/v2/analyze';

export const defaultConcurrency = 2; // It's a public service, there is no need to go faster since nothing depends on the result

const ObservatoryResponseSchema = z.object({
  scan: z.object({
    algorithm_version: z.number().int().nullish(),
    scanned_at: z.coerce.date().nullish(),
    error: z.string().nullish(),
    grade: z.string().nullish(),
    score: z.number().int().nullish(),
    status_code: z.number().int().nullish(),
    tests_failed: z.number().int().nullish(),
    tests_passed: z.number().int().nullish(),
    tests_quantity: z.number().int().nullish(),
  }),
  tests: z
    .record(
      z.string(),
      z.object({
        pass: z.boolean().nullish(),
        result: z.string().nullish(),
        score_modifier: z.number().nullish(),
      })
    )
    .nullish(),
});

export type ObservatoryResult =
  | { type: 'scanned'; response: z.infer<typeof ObservatoryResponseSchema> }
  | { type: 'unscannable'; error: string } // Unreachable or invalid host, it won't be better by trying again right away
  | { type: 'unavailable'; error: string }; // The service itself refuses, so the run must stop

export async function fetchObservatoryResult(domain: string): Promise<ObservatoryResult> {
  const response = await fetch(`${observatoryAnalyzeUrl}?host=${encodeURIComponent(domain)}`, {
    method: 'POST',
    signal: AbortSignal.timeout(120_000),
  });

  if (response.status === 422) {
    const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;

    return { type: 'unscannable', error: body?.message ?? body?.error ?? 'unprocessable host' };
  } else if (!response.ok) {
    return { type: 'unavailable', error: `status ${response.status}` };
  }

  return { type: 'scanned', response: ObservatoryResponseSchema.parse(await response.json()) };
}

export async function registerInitiativesDomainsForHttpSecurity(): Promise<number> {
  return await prisma.$executeRaw`
    INSERT INTO "DomainHttpSecurity" ("domain", "updatedAt")
    SELECT DISTINCT d."name", NOW()
    FROM "RawDomain" d
    INNER JOIN "RawDomainsOnInitiativeMaps" dm ON dm."rawDomainId" = d."id"
    INNER JOIN "Initiative" i ON i."originId" = dm."initiativeMapId" AND i."deletedAt" IS NULL
    WHERE d."redirectDomainTargetName" IS NULL
    ON CONFLICT ("domain") DO NOTHING
  `;
}

export async function flagDomainsForHttpSecurityUpdate(domains?: string[]): Promise<number> {
  const { count } = await prisma.domainHttpSecurity.updateMany({
    where: domains ? { domain: { in: domains } } : {},
    data: { update: true },
  });

  return count;
}

export async function updateDomainsHttpSecurity(options?: { maximumDomains?: number; concurrency?: number }) {
  await registerInitiativesDomainsForHttpSecurity();

  const domains = await prisma.domainHttpSecurity.findMany({
    where: { update: true },
    select: { domain: true },
    orderBy: { domain: 'asc' },
    take: options?.maximumDomains,
  });

  console.log(`${domains.length} domains to scan`);

  const queue = domains.map(({ domain }) => domain);
  const startedAt = Date.now();
  let processedDomains = 0;
  let unscannableDomains = 0;
  let stopReason: string | null = null;

  const processQueue = async () => {
    while (queue.length > 0 && !stopReason) {
      watchGracefulExitInLoop();

      const domain = queue.shift() as string;
      const result = await fetchObservatoryResult(domain).catch((error: Error) => ({ type: 'unscannable' as const, error: error.message }));

      if (result.type === 'unavailable') {
        stopReason = result.error;

        break;
      }

      const scan = result.type === 'scanned' ? result.response.scan : null;
      const tests = result.type === 'scanned' ? result.response.tests : null;
      const error = result.type === 'unscannable' ? result.error : scan?.error ?? null;

      await prisma.domainHttpSecurity.update({
        where: { domain: domain },
        data: {
          update: false,
          grade: scan?.grade ?? null,
          score: scan?.score ?? null,
          testsPassed: scan?.tests_passed ?? null,
          testsFailed: scan?.tests_failed ?? null,
          testsQuantity: scan?.tests_quantity ?? null,
          statusCode: scan?.status_code ?? null,
          algorithmVersion: scan?.algorithm_version ?? null,
          tests: tests ?? Prisma.DbNull,
          scannedAt: scan?.scanned_at ?? null,
          lastCheckAt: new Date(),
          lastCheckError: error,
        },
      });

      processedDomains++;
      unscannableDomains += error ? 1 : 0;

      if (processedDomains % 50 === 0) {
        console.log(`${processedDomains}/${domains.length} domains scanned`);
      }
    }
  };

  await Promise.all(Array.from({ length: options?.concurrency ?? defaultConcurrency }, processQueue));
  await updateInitiativesIndicators();

  console.log(
    `${processedDomains} domains scanned in ${Math.round((Date.now() - startedAt) / 1000)}s (${unscannableDomains} without a grade)${
      stopReason ? `, stopped because the service answered with ${stopReason}` : ''
    }`
  );
}
