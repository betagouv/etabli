import { eachOfLimit } from 'async';
import { subDays } from 'date-fns/subDays';
import dns from 'dns/promises';
import fs from 'fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';
import path from 'path';
import { promisify } from 'util';
import { gunzip } from 'zlib';

import { downloadFile, isFileOutdated } from '@etabli/src/common';
import { updateInitiativesIndicators } from '@etabli/src/features/initiative-indicators';
import { prisma } from '@etabli/src/prisma';
import { watchGracefulExitInLoop } from '@etabli/src/server/system';
import { SovereigntySignals, classifyForeignDependencies, findExternalHosts } from '@etabli/src/utils/foreign-dependencies';

// Public domain data, updated hourly by its author (ref: https://iptoasn.com/)
const ipRangesRemoteUrl = 'https://iptoasn.com/data/ip2asn-v4.tsv.gz';
const ipRangesLocalPath = path.resolve(process.cwd(), './data/ip2asn-v4.tsv.gz');

const recheckDelayInDays = 30;
const defaultConcurrency = 10;

export interface IpRange {
  start: number;
  end: number;
  asn: number;
  country: string | null;
  name: string | null;
}

export function ipToNumber(ip: string): number {
  return ip.split('.').reduce((total, part) => total * 256 + parseInt(part, 10), 0);
}

export function parseIpRanges(content: string): IpRange[] {
  return content
    .split('\n')
    .flatMap((line) => {
      const [start, end, asn, country, name] = line.split('\t');

      return start && end && asn && asn !== '0'
        ? [{ start: ipToNumber(start), end: ipToNumber(end), asn: parseInt(asn, 10), country: country || null, name: name?.trim() || null }]
        : [];
    })
    .sort((a, b) => a.start - b.start);
}

export function findIpRange(ranges: IpRange[], ip: string): IpRange | null {
  const value = ipToNumber(ip);
  let low = 0;
  let high = ranges.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const range = ranges[middle];

    if (value < range.start) {
      high = middle - 1;
    } else if (value > range.end) {
      low = middle + 1;
    } else {
      return range;
    }
  }

  return null;
}

async function loadIpRanges(): Promise<IpRange[]> {
  if (await isFileOutdated(ipRangesLocalPath)) {
    await downloadFile(ipRangesRemoteUrl, ipRangesLocalPath);
  }

  return parseIpRanges((await promisify(gunzip)(new Uint8Array(await fs.readFile(ipRangesLocalPath)))).toString('utf-8'));
}

// A missing record is a normal answer, a domain has no CNAME or no emails most of the time
async function resolveOrEmpty<T>(resolve: () => Promise<T[]>): Promise<T[]> {
  try {
    return await resolve();
  } catch (error) {
    return [];
  }
}

export async function registerInitiativesDomainsForSovereignty(): Promise<number> {
  return await prisma.$executeRaw`
    INSERT INTO "DomainSovereignty" ("domain", "updatedAt")
    SELECT DISTINCT d."name", NOW()
    FROM "RawDomain" d
    INNER JOIN "RawDomainsOnInitiativeMaps" dm ON dm."rawDomainId" = d."id"
    INNER JOIN "Initiative" i ON i."originId" = dm."initiativeMapId" AND i."deletedAt" IS NULL
    WHERE d."redirectDomainTargetName" IS NULL
    ON CONFLICT ("domain") DO NOTHING
  `;
}

// It only uses DNS records and home pages already stored, so no request reaches the websites
export async function updateDomainsSovereignty(options?: { maximumDomains?: number; concurrency?: number }) {
  await registerInitiativesDomainsForSovereignty();

  const domains = await prisma.domainSovereignty.findMany({
    where: { OR: [{ lastCheckAt: null }, { lastCheckAt: { lt: subDays(new Date(), recheckDelayInDays) } }] },
    select: { domain: true },
    orderBy: { domain: 'asc' },
    take: options?.maximumDomains,
  });

  console.log(`${domains.length} domains to look at`);

  if (domains.length === 0) {
    return;
  }

  const ipRanges = await loadIpRanges();
  const virtualConsole = new VirtualConsole();
  let processedDomains = 0;

  await eachOfLimit(domains, options?.concurrency ?? defaultConcurrency, async ({ domain }) => {
    watchGracefulExitInLoop();

    const [addresses, cnames, mailRecords, rawDomain] = await Promise.all([
      resolveOrEmpty(() => dns.resolve4(domain)),
      resolveOrEmpty(() => dns.resolveCname(domain)),
      resolveOrEmpty(() => dns.resolveMx(domain)),
      prisma.rawDomain.findUnique({ where: { name: domain }, select: { websiteRawContent: true } }),
    ]);

    let thirdPartyHosts: string[] = [];

    if (rawDomain?.websiteRawContent) {
      const dom = new JSDOM(rawDomain.websiteRawContent, { contentType: 'text/html', virtualConsole: virtualConsole });

      thirdPartyHosts = findExternalHosts(dom.window.document, domain);
      dom.window.close();
    }

    const ipRange = addresses.length > 0 ? findIpRange(ipRanges, addresses[0]) : null;
    const signals: SovereigntySignals = {
      network: ipRange ? { asn: ipRange.asn, name: ipRange.name, country: ipRange.country } : null,
      cnames: cnames.map((cname) => cname.toLowerCase()),
      mailHosts: mailRecords.map((record) => record.exchange.toLowerCase()),
      thirdPartyHosts: thirdPartyHosts,
    };
    const { level, dependencies } = classifyForeignDependencies(signals);

    await prisma.domainSovereignty.update({
      where: { domain: domain },
      data: {
        ipAddress: addresses[0] ?? null,
        asn: ipRange?.asn ?? null,
        asnName: ipRange?.name ?? null,
        asnCountry: ipRange?.country ?? null,
        cnames: signals.cnames,
        mailHosts: signals.mailHosts,
        thirdPartyHosts: signals.thirdPartyHosts,
        level: level,
        dependencies: dependencies,
        lastCheckAt: new Date(),
      },
    });

    processedDomains++;

    if (processedDomains % 500 === 0) {
      console.log(`${processedDomains}/${domains.length} domains processed`);
    }
  });

  await updateInitiativesIndicators();

  console.log(`${processedDomains} domains processed`);
}
