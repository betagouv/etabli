import { ParseResultType, parseDomain } from 'parse-domain';
import z from 'zod';

import { Prisma } from '@etabli/src/generated/prisma/client';
import { prisma } from '@etabli/src/prisma';
import { watchGracefulExitInLoop } from '@etabli/src/server/system';

// It returns the same statistics as the summary endpoint but for many targets at once, which is what makes it affordable (ref: https://docs.dataforseo.com/v3/backlinks-bulk_pages_summary-live/)
export const dataForSeoBulkSummaryUrl = 'https://api.dataforseo.com/v3/backlinks/bulk_pages_summary/live';

export const maximumTargetsPerRequest = 1000;
export const maximumDifferentDomainsPerRequest = 100; // Documented limit of the API, even if the number of targets is lower than the above one

// Observed on real responses (0.02003 for 1 target and 0.02009 for 3), the billed amount is the one returned by the API
export const costPerRequest = 0.02;
export const costPerTarget = 0.00003;

export const defaultMaximumCost = 1; // In dollars, a whole pass has to be asked explicitly

const DataForSeoItemSchema = z
  .object({
    url: z.string().min(1),
    rank: z.number().int().nullable(),
    backlinks: z.number().int().nullable(),
    first_seen: z.string().nullable(),
    backlinks_spam_score: z.number().int().nullable(),
    referring_pages: z.number().int().nullable(),
    referring_domains: z.number().int().nullable(),
    referring_domains_nofollow: z.number().int().nullable(),
    referring_main_domains: z.number().int().nullable(),
    referring_ips: z.number().int().nullable(),
    broken_backlinks: z.number().int().nullable(),
    broken_pages: z.number().int().nullable(),
    referring_links_semantic_locations: z.record(z.string(), z.number()).nullable(),
    referring_links_types: z.record(z.string(), z.number()).nullable(),
    referring_links_platform_types: z.record(z.string(), z.number()).nullable(),
    referring_links_countries: z.record(z.string(), z.number()).nullable(),
    referring_links_tld: z.record(z.string(), z.number()).nullable(),
  })
  .passthrough();
export type DataForSeoItemSchemaType = z.infer<typeof DataForSeoItemSchema>;

const successStatusCode = 20000;

const DataForSeoResponseSchema = z
  .object({
    status_code: z.number(),
    status_message: z.string(),
    tasks: z.array(
      z
        .object({
          status_code: z.number(),
          status_message: z.string(),
          cost: z.number(),
          result: z
            .array(
              z
                .object({
                  items: z.array(DataForSeoItemSchema).nullable(),
                })
                .passthrough()
            )
            .nullable(),
        })
        .passthrough()
    ),
  })
  .passthrough();

export function estimateRequestCost(targetsCount: number): number {
  return costPerRequest + targetsCount * costPerTarget;
}

export function getMainDomain(domain: string): string {
  const result = parseDomain(domain);

  return result.type === ParseResultType.Listed && result.domain ? [result.domain, ...result.topLevelDomains].join('.') : domain;
}

// Subdomains of the same domain are kept together since they do not count against the limit of different domains
export function splitDomainsIntoRequests(
  domains: string[],
  maximumDifferentDomains: number = maximumDifferentDomainsPerRequest,
  maximumTargets: number = maximumTargetsPerRequest
): string[][] {
  const domainsByMainDomain = new Map<string, string[]>();

  for (const domain of domains) {
    const mainDomain = getMainDomain(domain);

    domainsByMainDomain.set(mainDomain, [...(domainsByMainDomain.get(mainDomain) ?? []), domain]);
  }

  const requests: string[][] = [];
  let currentRequest: string[] = [];
  let currentMainDomainsCount = 0;

  for (const mainDomainTargets of domainsByMainDomain.values()) {
    if (currentRequest.length > 0 && currentMainDomainsCount >= maximumDifferentDomains) {
      requests.push(currentRequest);
      currentRequest = [];
      currentMainDomainsCount = 0;
    }

    currentMainDomainsCount++;

    for (const target of mainDomainTargets) {
      if (currentRequest.length >= maximumTargets) {
        requests.push(currentRequest);
        currentRequest = [];
        currentMainDomainsCount = 1;
      }

      currentRequest.push(target);
    }
  }

  if (currentRequest.length > 0) {
    requests.push(currentRequest);
  }

  return requests;
}

export async function fetchBulkSummary(targets: string[]): Promise<{ items: DataForSeoItemSchemaType[]; cost: number }> {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;

  if (!login || !password) {
    throw new Error('DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD must be set to retrieve the reputation of domains');
  }

  const response = await fetch(dataForSeoBulkSummaryUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([{ targets: targets, include_subdomains: false, rank_scale: 'one_hundred' }]),
  });

  if (!response.ok) {
    throw new Error(`the reputation request has failed: ${response.status} ${response.statusText}`);
  }

  const body = DataForSeoResponseSchema.parse(await response.json());
  const task = body.tasks[0];

  if (body.status_code !== successStatusCode) {
    throw new Error(`the reputation request has failed: ${body.status_code} ${body.status_message}`);
  } else if (!task || task.status_code !== successStatusCode) {
    throw new Error(`the reputation task has failed: ${task?.status_code} ${task?.status_message}`);
  }

  return {
    items: task.result?.flatMap((result) => result.items ?? []) ?? [],
    cost: task.cost,
  };
}

// Reputation is displayed for initiatives, a domain leading to another one has no statistics of its own
export async function registerInitiativesDomainsForReputation(): Promise<number> {
  return await prisma.$executeRaw`
    INSERT INTO "DomainReputation" ("domain", "updatedAt")
    SELECT DISTINCT d."name", NOW()
    FROM "RawDomain" d
    INNER JOIN "RawDomainsOnInitiativeMaps" dm ON dm."rawDomainId" = d."id"
    INNER JOIN "Initiative" i ON i."originId" = dm."initiativeMapId" AND i."deletedAt" IS NULL
    WHERE d."redirectDomainTargetName" IS NULL
    ON CONFLICT ("domain") DO NOTHING
  `;
}

export async function flagDomainsForReputationUpdate(domains?: string[]): Promise<number> {
  const { count } = await prisma.domainReputation.updateMany({
    where: domains ? { domain: { in: domains } } : {},
    data: { update: true },
  });

  return count;
}

// It costs nothing, so it can be part of the recurrent job to follow domains moving between initiatives
export async function updateInitiativesReputation(): Promise<number> {
  return await prisma.$executeRaw`
    UPDATE "Initiative" i
    SET "reputationRank" = computed."rank"
    FROM (
      SELECT i2."id", MAX(r."rank") AS "rank"
      FROM "Initiative" i2
      LEFT JOIN "RawDomainsOnInitiativeMaps" dm ON dm."initiativeMapId" = i2."originId"
      LEFT JOIN "RawDomain" d ON d."id" = dm."rawDomainId"
      LEFT JOIN "DomainReputation" r ON r."domain" = d."name"
      GROUP BY i2."id"
    ) computed
    WHERE i."id" = computed."id" AND i."reputationRank" IS DISTINCT FROM computed."rank"
  `;
}

export interface UpdateDomainsReputationOptions {
  maximumDomains?: number;
  maximumCost?: number;
  maximumDifferentDomains?: number;
  dryRun?: boolean;
}

export async function updateDomainsReputation(options?: UpdateDomainsReputationOptions) {
  const maximumCost = options?.maximumCost ?? defaultMaximumCost;

  await registerInitiativesDomainsForReputation();

  const domains = await prisma.domainReputation.findMany({
    where: { update: true },
    select: { domain: true },
    orderBy: { domain: 'asc' },
    take: options?.maximumDomains,
  });

  const requests = splitDomainsIntoRequests(
    domains.map(({ domain }) => domain),
    options?.maximumDifferentDomains
  );
  const estimatedCost = requests.reduce((total, targets) => total + estimateRequestCost(targets.length), 0);

  console.log(`${domains.length} domains to retrieve in ${requests.length} requests, for about $${estimatedCost.toFixed(2)}`);

  if (options?.dryRun) {
    return;
  }

  let spent = 0;
  let processedDomains = 0;

  for (const targets of requests) {
    watchGracefulExitInLoop();

    if (spent + estimateRequestCost(targets.length) > maximumCost) {
      console.log(`stopping before exceeding the maximum cost of $${maximumCost}, the remaining domains will be part of the next run`);

      break;
    }

    // Each batch is saved right away, a failure must not lose what has already been paid for
    const { items, cost } = await fetchBulkSummary(targets);
    const itemsByDomain = new Map(items.map((item) => [item.url.toLowerCase(), item]));

    spent += cost;
    processedDomains += targets.length;

    await prisma.$transaction(
      targets.map((domain) => {
        const item = itemsByDomain.get(domain.toLowerCase());

        return prisma.domainReputation.update({
          where: { domain: domain },
          data: {
            update: false,
            rank: item?.rank ?? null,
            backlinks: item?.backlinks ?? null,
            referringPages: item?.referring_pages ?? null,
            referringDomains: item?.referring_domains ?? null,
            referringDomainsNofollow: item?.referring_domains_nofollow ?? null,
            referringMainDomains: item?.referring_main_domains ?? null,
            referringIps: item?.referring_ips ?? null,
            backlinksSpamScore: item?.backlinks_spam_score ?? null,
            brokenBacklinks: item?.broken_backlinks ?? null,
            brokenPages: item?.broken_pages ?? null,
            firstSeenAt: item?.first_seen ? new Date(item.first_seen) : null,
            linksSemanticLocations: item?.referring_links_semantic_locations ?? Prisma.DbNull,
            linksTypes: item?.referring_links_types ?? Prisma.DbNull,
            linksPlatformTypes: item?.referring_links_platform_types ?? Prisma.DbNull,
            linksCountries: item?.referring_links_countries ?? Prisma.DbNull,
            linksTopLevelDomains: item?.referring_links_tld ?? Prisma.DbNull,
            summary: item ? (item as Prisma.InputJsonValue) : Prisma.DbNull,
            lastCheckAt: new Date(),
          },
          select: { domain: true },
        });
      })
    );

    console.log(`${processedDomains}/${domains.length} domains retrieved, $${spent.toFixed(5)} spent so far`);
  }

  await updateInitiativesReputation();

  console.log(`the run has cost $${spent.toFixed(5)} for ${processedDomains} domains`);
}
