import { subDays } from 'date-fns/subDays';

import { updateProtectedWebsiteDataOnDomains } from '@etabli/src/features/domain';
import { updateDomainsInventory } from '@etabli/src/features/domain-inventory';
import { prisma } from '@etabli/src/prisma';

// Websites still refusing us after the stealth browser: their content stayed the one known before and their tools are unknown.
// Most of them answer a plain 403 without any anti-bot signature, they refuse where the request comes from (the network of a VPN for
// example), so this is meant to be run from another network. Nothing more is done than in the regular processes (one page per website,
// `robots.txt` respected, no challenge solved)
export async function listBlockedDomains(): Promise<{ contentDomains: string[]; inventoryDomains: string[] }> {
  const contentDomains = await prisma.rawDomain.findMany({
    where: { deletedAt: null, isProtected: true, updateProtectedWebsiteData: false },
    select: { name: true },
  });
  const inventoryDomains = await prisma.$queryRaw<{ domain: string }[]>`
    SELECT "domain" FROM "DomainInventory" WHERE "lastCheckError" ~ '"status":(401|403|406|429)'
  `;

  return {
    contentDomains: contentDomains.map(({ name }) => name).sort(),
    inventoryDomains: inventoryDomains.map(({ domain }) => domain).sort(),
  };
}

export function getRootDomainsCount(domains: string[]): [string, number][] {
  const counts = new Map<string, number>();

  for (const domain of domains) {
    const root = domain.split('.').slice(-2).join('.');

    counts.set(root, (counts.get(root) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export async function retryBlockedDomains(options: { dryRun: boolean }): Promise<void> {
  const { contentDomains, inventoryDomains } = await listBlockedDomains();
  const allDomains = [...new Set([...contentDomains, ...inventoryDomains])];

  console.log(`${contentDomains.length} websites whose content is blocked, ${inventoryDomains.length} whose tools analysis is blocked`);
  console.log(
    `the most frequent hosts: ${getRootDomainsCount(allDomains)
      .slice(0, 10)
      .map(([root, count]) => `${root} (${count})`)
      .join(', ')}`
  );

  if (options.dryRun) {
    return;
  }

  // One kind of processing after the other, as for the regular runs
  await prisma.rawDomain.updateMany({ where: { name: { in: contentDomains } }, data: { updateProtectedWebsiteData: true } });
  await updateProtectedWebsiteDataOnDomains();

  await prisma.domainInventory.updateMany({ where: { domain: { in: inventoryDomains } }, data: { lastCheckAt: subDays(new Date(), 2) } });
  await updateDomainsInventory({ onlyDomains: inventoryDomains });

  const after = await listBlockedDomains();

  console.log(
    `still blocked: ${after.contentDomains.length}/${contentDomains.length} for the content, ${after.inventoryDomains.length}/${inventoryDomains.length} for the tools`
  );
}
