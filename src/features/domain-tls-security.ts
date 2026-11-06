import { setTimeout as sleep } from 'timers/promises';
import z from 'zod';

import { Prisma } from '@etabli/src/generated/prisma/client';
import { updateInitiativesIndicators } from '@etabli/src/features/initiative-indicators';
import { prisma } from '@etabli/src/prisma';
import { watchGracefulExitInLoop } from '@etabli/src/server/system';
import { getWorstGrade } from '@etabli/src/utils/security-grade';

// The email must have been registered once, and personal providers are refused (ref: https://github.com/ssllabs/ssllabs-scan/blob/master/ssllabs-api-docs-v4.md)
export const sslLabsAnalyzeUrl = 'https://api.ssllabs.com/api/v4/analyze';

export const defaultConcurrency = 1; // Their documentation asks for one host at a time when not in a hurry, each one takes at least a minute
const delayBetweenNewAssessmentsInMilliseconds = 1000;
const maximumAttemptsPerDomain = 120;

const SslLabsResponseSchema = z.object({
  status: z.string(),
  statusMessage: z.string().nullish(),
  endpoints: z
    .array(
      z.object({
        ipAddress: z.string().nullish(),
        grade: z.string().nullish(),
        statusMessage: z.string().nullish(),
      })
    )
    .nullish(),
});

export type SslLabsResult =
  | { type: 'graded'; grade: string | null; endpoints: { ipAddress: string | null; grade: string | null }[]; error: string | null }
  | { type: 'unavailable'; error: string }; // The service refuses, so the run must stop

export async function fetchSslLabsResult(domain: string, email: string, options?: { pollingDelayInMilliseconds?: number }): Promise<SslLabsResult> {
  for (let attempt = 0; attempt < maximumAttemptsPerDomain; attempt++) {
    const response = await fetch(`${sslLabsAnalyzeUrl}?host=${encodeURIComponent(domain)}&fromCache=on&maxAge=720`, {
      headers: { email: email },
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      return { type: 'unavailable', error: `status ${response.status}` }; // Rate limits, overload or unregistered email
    }

    const result = SslLabsResponseSchema.parse(await response.json());

    if (result.status === 'ERROR') {
      return { type: 'graded', grade: null, endpoints: [], error: result.statusMessage ?? 'unknown error' };
    } else if (result.status === 'READY') {
      const endpoints = (result.endpoints ?? []).map((endpoint) => ({ ipAddress: endpoint.ipAddress ?? null, grade: endpoint.grade ?? null }));
      const grade = getWorstGrade(endpoints.flatMap((endpoint) => endpoint.grade ?? [])); // Visitors can reach any of them

      return { type: 'graded', grade: grade, endpoints: endpoints, error: grade ? null : (result.endpoints?.[0]?.statusMessage ?? 'no grade') };
    }

    // Polling less often once started is what they ask for
    await sleep(options?.pollingDelayInMilliseconds ?? (result.status === 'IN_PROGRESS' ? 10_000 : 5_000));
  }

  return { type: 'graded', grade: null, endpoints: [], error: 'assessment too long' };
}

export async function registerInitiativesDomainsForTlsSecurity(): Promise<number> {
  return await prisma.$executeRaw`
    INSERT INTO "DomainTlsSecurity" ("domain", "updatedAt")
    SELECT DISTINCT d."name", NOW()
    FROM "RawDomain" d
    INNER JOIN "RawDomainsOnInitiativeMaps" dm ON dm."rawDomainId" = d."id"
    INNER JOIN "Initiative" i ON i."originId" = dm."initiativeMapId" AND i."deletedAt" IS NULL
    WHERE d."redirectDomainTargetName" IS NULL
    ON CONFLICT ("domain") DO NOTHING
  `;
}

export async function flagDomainsForTlsSecurityUpdate(domains?: string[]): Promise<number> {
  const { count } = await prisma.domainTlsSecurity.updateMany({
    where: domains ? { domain: { in: domains } } : {},
    data: { update: true },
  });

  return count;
}

export async function updateDomainsTlsSecurity(options?: { maximumDomains?: number; concurrency?: number }) {
  const email = process.env.SSLLABS_EMAIL;

  if (!email) {
    throw new Error('`SSLLABS_EMAIL` must be provided, it has to be registered once on SSL Labs');
  }

  await registerInitiativesDomainsForTlsSecurity();

  const domains = await prisma.domainTlsSecurity.findMany({
    where: { update: true },
    select: { domain: true },
    orderBy: { domain: 'asc' },
    take: options?.maximumDomains,
  });

  console.log(`${domains.length} domains to assess`);

  const queue = domains.map(({ domain }) => domain);
  const startedAt = Date.now();
  let processedDomains = 0;
  let stopReason: string | null = null;

  const processQueue = async () => {
    while (queue.length > 0 && !stopReason) {
      watchGracefulExitInLoop();

      const domain = queue.shift() as string;
      const result = await fetchSslLabsResult(domain, email);

      if (result.type === 'unavailable') {
        stopReason = result.error;

        break;
      }

      await prisma.domainTlsSecurity.update({
        where: { domain: domain },
        data: {
          update: false,
          grade: result.grade,
          endpoints: result.endpoints.length > 0 ? result.endpoints : Prisma.DbNull,
          lastCheckAt: new Date(),
          lastCheckError: result.error,
        },
      });

      processedDomains++;
      console.log(`${domain}: ${result.grade ?? result.error} (${processedDomains}/${domains.length})`);

      await sleep(delayBetweenNewAssessmentsInMilliseconds);
    }
  };

  await Promise.all(Array.from({ length: options?.concurrency ?? defaultConcurrency }, processQueue));
  await updateInitiativesIndicators();

  console.log(
    `${processedDomains} domains assessed in ${Math.round((Date.now() - startedAt) / 1000)}s${stopReason ? `, stopped because the service answered with ${stopReason}` : ''}`
  );
}
