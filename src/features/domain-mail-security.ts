import { eachOfLimit } from 'async';
import { subDays } from 'date-fns/subDays';
import dns from 'dns/promises';
import { ParseResultType, parseDomain } from 'parse-domain';
import { setTimeout as sleep } from 'timers/promises';

import { resolveOrEmpty } from '@etabli/src/features/domain-sovereignty';
import { updateInitiativesIndicators } from '@etabli/src/features/initiative-indicators';
import { prisma } from '@etabli/src/prisma';
import { watchGracefulExitInLoop } from '@etabli/src/server/system';
import { classifyMailSecurity } from '@etabli/src/utils/domain-security-issues';

const recheckDelayInDays = 30;
const delayBetweenRootDomainsInMilliseconds = 500; // Each root domain is 3 DNS queries, bursts looked to bring a VPN tunnel down
const maximumConsecutiveFailures = 50;
const defaultConcurrency = 5; // Each worker still waits between root domains, so the VPN tunnel is not flooded

// Mails are sent from the organization domain and not from the website: `www.mairie.fr` has no MX whereas `mairie.fr` does
export function getRootDomain(domain: string): string {
  const parsedDomain = parseDomain(domain);

  return parsedDomain.type === ParseResultType.Listed && parsedDomain.domain
    ? [parsedDomain.domain, ...parsedDomain.topLevelDomains].join('.')
    : domain;
}

export async function registerInitiativesDomainsForMailSecurity(): Promise<number> {
  return await prisma.$executeRaw`
    INSERT INTO "DomainMailSecurity" ("domain", "updatedAt")
    SELECT DISTINCT d."name", NOW()
    FROM "RawDomain" d
    INNER JOIN "RawDomainsOnInitiativeMaps" dm ON dm."rawDomainId" = d."id"
    INNER JOIN "Initiative" i ON i."originId" = dm."initiativeMapId" AND i."deletedAt" IS NULL
    WHERE d."redirectDomainTargetName" IS NULL
    ON CONFLICT ("domain") DO NOTHING
  `;
}

interface RootDomainAnswer {
  hasMx: boolean;
  txtRecords: string[];
  dmarcTxtRecords: string[];
}

async function queryRootDomain(rootDomain: string): Promise<RootDomainAnswer> {
  const [mailRecords, txtRecords, dmarcTxtRecords] = await Promise.all([
    resolveOrEmpty(() => dns.resolveMx(rootDomain)),
    resolveOrEmpty(() => dns.resolveTxt(rootDomain)),
    resolveOrEmpty(() => dns.resolveTxt(`_dmarc.${rootDomain}`)),
  ]);

  return {
    hasMx: mailRecords.some((record) => record.exchange !== '' && record.exchange !== '.'), // A "null MX" declares that no email is accepted
    txtRecords: txtRecords.map((chunks) => chunks.join('')),
    dmarcTxtRecords: dmarcTxtRecords.map((chunks) => chunks.join('')),
  };
}

// Public DNS records only, so no request reaches the websites
export async function updateDomainsMailSecurity(options?: { maximumDomains?: number; concurrency?: number }) {
  await registerInitiativesDomainsForMailSecurity();

  const domains = await prisma.domainMailSecurity.findMany({
    where: { OR: [{ lastCheckAt: null }, { lastCheckAt: { lt: subDays(new Date(), recheckDelayInDays) } }] },
    select: { domain: true },
    orderBy: { domain: 'asc' },
    take: options?.maximumDomains,
  });

  console.log(`${domains.length} domains to look at`);

  if (domains.length === 0) {
    return;
  }

  await dns.resolve4('www.service-public.fr'); // It stops right away instead of going through all domains if DNS does not work

  // Websites of the same organization share the same answer, a pending query is shared too so concurrent workers do not repeat it
  const answers = new Map<string, Promise<RootDomainAnswer>>();
  let consecutiveFailures = 0;
  let processedDomains = 0;

  await eachOfLimit(domains, options?.concurrency ?? defaultConcurrency, async ({ domain }) => {
    watchGracefulExitInLoop();

    const rootDomain = getRootDomain(domain);
    let pendingAnswer = answers.get(rootDomain);
    const isNewQuery = !pendingAnswer;

    if (!pendingAnswer) {
      pendingAnswer = queryRootDomain(rootDomain);
      answers.set(rootDomain, pendingAnswer);
    }

    let answer: RootDomainAnswer;
    try {
      answer = await pendingAnswer;
      consecutiveFailures = 0;
    } catch (error) {
      // Nothing is stored so it will be taken next time, but if it lasts the network is down and going on would be useless
      answers.delete(rootDomain);
      consecutiveFailures++;

      if (consecutiveFailures >= maximumConsecutiveFailures) {
        throw error;
      }

      return;
    }

    if (isNewQuery) {
      await sleep(delayBetweenRootDomainsInMilliseconds);
    }

    const { usesMail, issues, level } = classifyMailSecurity(answer);

    await prisma.domainMailSecurity.update({
      where: { domain: domain },
      data: {
        rootDomain: rootDomain,
        hasMx: answer.hasMx,
        txtRecords: answer.txtRecords.filter((record) => /^v=spf1/i.test(record.trim())), // Other ones can contain verification tokens
        dmarcRecords: answer.dmarcTxtRecords,
        usesMail: usesMail,
        issues: issues,
        level: level,
        lastCheckAt: new Date(),
      },
    });

    processedDomains++;

    if (processedDomains % 500 === 0) {
      console.log(`${processedDomains}/${domains.length} domains processed`);
    }
  });

  await updateInitiativesIndicators();

  console.log(`${processedDomains} domains processed from ${answers.size} root domains`);
}
