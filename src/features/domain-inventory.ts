import { eachOfLimit } from 'async';
import { parse } from 'csv-parse';
import { subDays } from 'date-fns/subDays';
import fsSync from 'fs';

import { CsvDomainSchema, isTechnicalDomain, localCsvPath } from '@etabli/src/features/domain';
import { buildOrganizationMatcher } from '@etabli/src/features/organization';
import { loadLatestWappalyzerFingerprints } from '@etabli/src/features/wappalyzer-fingerprints';
import { prisma } from '@etabli/src/prisma';
import { watchGracefulExitInLoop } from '@etabli/src/server/system';
import { BlockingCircuitBreaker, shuffle } from '@etabli/src/utils/circuit-breaker';
import { formatArrayProgress } from '@etabli/src/utils/format';
import { chomiumMaxConcurrency, maximumDomainsPerRun } from '@etabli/src/utils/request';
import { WappalyzerResultSchema } from '@etabli/src/wappalyzer';

const recheckDelayInDays = 20;

export interface DetectedTechnology {
  technology: string;
  version: string | null;
  cpe: string | null;
  confidence: number;
}

// Same as the Wappalyzer default ones, without its fixed profile directory: once a browser crashed and left a process behind, all
// the next launches were refused for the whole run. This way each browser gets its own temporary profile
const wappalyzerChromiumArguments = [
  '--headless=old',
  '--no-sandbox',
  '--no-zygote',
  '--disable-gpu',
  '--ignore-certificate-errors',
  '--allow-running-insecure-content',
  '--disable-web-security',
];

// Wappalyzer does not know some tools that matter, especially the ones hosted by administrations for their internal needs
const customSignatures: { technology: string; pattern: RegExp; version?: RegExp; cpe?: string }[] = [
  {
    technology: 'Metabase',
    pattern: /window\.MetabaseBootstrap|<title>Metabase<\/title>/,
    version: /"version":\{[^}]*"tag":"v?([\d.]+)"/,
    cpe: 'cpe:2.3:a:metabase:metabase:*:*:*:*:*:*:*:*',
  },
  {
    technology: 'Keycloak',
    pattern: /\/resources\/[a-z0-9]+\/(login|common|admin)\/|kc-page-title|id="kc-/,
    cpe: 'cpe:2.3:a:redhat:keycloak:*:*:*:*:*:*:*:*',
  },
  { technology: 'Redash', pattern: /<title>Redash<\/title>|redash-app/i },
  {
    technology: 'Apache Superset',
    pattern: /<title>Superset<\/title>|static\/assets\/.*superset/i,
    cpe: 'cpe:2.3:a:apache:superset:*:*:*:*:*:*:*:*',
  },
];

export function detectCustomTechnologies(html: string): DetectedTechnology[] {
  return customSignatures.flatMap(({ technology, pattern, version, cpe }) => {
    if (!pattern.test(html)) {
      return [];
    }

    return [{ technology: technology, version: version?.exec(html)?.[1] ?? null, cpe: cpe ?? null, confidence: 100 }];
  });
}

// Domains that are not initiatives are the reason of this inventory, and domains filtered when importing the list are not stored elsewhere
async function retrieveInventoryCandidates(): Promise<string[]> {
  const rawDomains = await prisma.rawDomain.findMany({ select: { name: true } });
  const candidates = new Set(rawDomains.map((rawDomain) => rawDomain.name));

  if (fsSync.existsSync(localCsvPath)) {
    const parser = fsSync.createReadStream(localCsvPath, 'utf-8').pipe(parse({ columns: true, delimiter: ',', cast: true, skip_empty_lines: true }));

    for await (const record of parser) {
      const result = CsvDomainSchema.safeParse(record);

      if (result.success && result.data.https_status === '200 OK' && isTechnicalDomain(result.data.name)) {
        candidates.add(result.data.name);
      }
    }
  }

  return [...candidates];
}

export async function updateDomainsInventory(options?: { maximumDomains?: number }) {
  const candidates = await retrieveInventoryCandidates();

  await prisma.domainInventory.createMany({
    data: candidates.map((domain) => ({ domain: domain })),
    skipDuplicates: true,
  });

  // Initiatives waiting to be computed need their domains analyzed first. Then the oldest ones come first so what cannot be processed
  // during a run is the first of the next one
  const maximumDomains = options?.maximumDomains ?? maximumDomainsPerRun ?? null;
  const dueDomains = await prisma.$queryRaw<{ domain: string; isRequired: boolean }[]>`
    SELECT i."domain", bool_or(m."id" IS NOT NULL) AS "isRequired"
    FROM "DomainInventory" i
    LEFT JOIN "RawDomain" d ON d."name" = i."domain"
    LEFT JOIN "RawDomainsOnInitiativeMaps" dm ON dm."rawDomainId" = d."id"
    LEFT JOIN "InitiativeMap" m ON m."id" = dm."initiativeMapId" AND m."update" = TRUE
    WHERE i."lastCheckAt" IS NULL
      OR i."lastCheckAt" < ${subDays(new Date(), recheckDelayInDays)}
      OR (i."lastCheckError" IS NOT NULL AND i."lastCheckAt" < ${subDays(new Date(), 1)}) -- Initiatives wait for it, so a failure is retried soon
    GROUP BY i."domain", i."lastCheckAt"
    ORDER BY bool_or(m."id" IS NOT NULL) DESC, i."lastCheckAt" ASC NULLS FIRST
    LIMIT ${maximumDomains}
  `;

  // Randomized to not hit the same provider on a row, without losing the priority in case the run does not reach the end
  const domains = [
    ...shuffle(dueDomains.filter((dueDomain) => dueDomain.isRequired)),
    ...shuffle(dueDomains.filter((dueDomain) => !dueDomain.isRequired)),
  ];

  console.log(
    `${domains.length} domains to analyze, including ${dueDomains.filter((dueDomain) => dueDomain.isRequired).length} needed by initiatives`
  );

  process.env.CHROMIUM_ARGS = process.env.CHROMIUM_ARGS ?? wappalyzerChromiumArguments.join(' '); // It's read when loading the module, so it has to be imported after this

  const { default: Wappalyzer } = await import('wappalyzer');
  const wappalyzer = new Wappalyzer({
    debug: false,
    delay: 0,
    maxDepth: 1,
    maxUrls: 1, // The home page is enough, this inventory must stay as discreet as possible for these websites
    noRedirect: true,
    maxWait: 5000,
    recursive: false,
    probe: false,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    htmlMaxCols: 2000,
    htmlMaxRows: 10000,
  });

  const circuitBreaker = new BlockingCircuitBreaker(200, 0.8);
  let notified = false;

  await loadLatestWappalyzerFingerprints();
  await wappalyzer.init();

  try {
    await eachOfLimit(domains, chomiumMaxConcurrency, async ({ domain }, index) => {
      watchGracefulExitInLoop();

      if (circuitBreaker.isOpen()) {
        if (!notified) {
          notified = true;
          console.warn(`stopping the inventory since most of the attempts fail, remaining domains will be processed next time`);
        }

        return;
      }

      console.log(`analyzing the domain ${domain} ${formatArrayProgress(index, domains.length)}`);

      const technologies = new Map<string, DetectedTechnology>();
      let checkError: string | null = null;

      try {
        const site = await wappalyzer.open(`https://${domain}`, {}, { local: {}, session: {} });
        const result = WappalyzerResultSchema.parse(await site.analyze());

        if (!Object.values(result.urls).some((metadata) => metadata.status >= 200 && metadata.status < 300)) {
          checkError = JSON.stringify(result.urls).slice(0, 500);
        }

        for (const technology of result.technologies) {
          if (technology.confidence >= 75) {
            technologies.set(technology.name, {
              technology: technology.name,
              version: technology.version || null,
              cpe: technology.cpe,
              confidence: technology.confidence,
            });
          }
        }
      } catch (error) {
        checkError = error instanceof Error ? error.message.slice(0, 500) : 'unknown error';
      }

      try {
        const response = await fetch(`https://${domain}`, { signal: AbortSignal.timeout(8000) });

        for (const technology of detectCustomTechnologies(await response.text())) {
          technologies.set(technology.technology, technology);
          checkError = null;
        }
      } catch (error) {
        // The main analysis has already told if the domain is reachable
      }

      // The browser could not start, it says nothing about the domain so it will be taken next time. It still counts as
      // a failure because otherwise a run would go through all the remaining domains without analyzing any of them
      if (checkError?.includes('Failed to launch the browser process')) {
        console.warn(`the analysis of ${domain} is postponed since the browser could not start`);
        circuitBreaker.record(true);

        return;
      }

      circuitBreaker.record(!!checkError);

      // Each analysis replaces the previous one, but an unreachable domain keeps what was known about it
      // The database can be busy with other long steps, and waiting is better than losing an analysis or crashing the whole run
      await prisma.$transaction(
        async (tx) => {
          if (!checkError) {
            await tx.domainTechnology.deleteMany({ where: { domain: domain } });
          }

          await tx.domainTechnology.createMany({
            data: [...technologies.values()].map((technology) => ({ ...technology, domain: domain })),
            skipDuplicates: true,
          });

          await tx.domainInventory.update({
            where: { domain: domain },
            data: { lastCheckAt: new Date(), lastCheckError: checkError },
          });
        },
        { maxWait: 60_000, timeout: 60_000 }
      );
    });
  } finally {
    await wappalyzer.destroy();
  }
}

export async function printDomainsUsingTechnology(technologyName: string) {
  const matcher = await buildOrganizationMatcher();
  const rows = await prisma.domainTechnology.findMany({
    where: { technology: { equals: technologyName, mode: 'insensitive' } },
    include: { inventory: { select: { lastCheckAt: true } } },
    orderBy: [{ version: 'asc' }, { domain: 'asc' }],
  });

  const organizationsIds = rows.flatMap((row) => matcher?.matchWebsite(`https://${row.domain}`) ?? []);
  const organizations = await prisma.organization.findMany({
    where: { id: { in: organizationsIds } },
    select: { id: true, name: true, directoryUrl: true },
  });
  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]));

  for (const row of rows) {
    const owners = (matcher?.matchWebsite(`https://${row.domain}`) ?? []).flatMap((id) => organizationById.get(id) ?? []);

    console.log(
      [
        row.domain,
        row.version ?? 'version inconnue',
        owners.map((owner) => owner.directoryUrl ?? owner.name).join(' ; ') || 'organisation inconnue',
      ].join('\t')
    );
  }

  console.log(`${rows.length} domains are using "${technologyName}"`);
}
