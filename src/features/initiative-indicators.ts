import { JSDOM, VirtualConsole } from 'jsdom';

import { prisma } from '@etabli/src/prisma';
import { watchGracefulExitInLoop } from '@etabli/src/server/system';
import { foreignRepositoryHosts } from '@etabli/src/utils/foreign-dependencies';
import { detectLegalLinksFromDocument } from '@etabli/src/utils/legal-links';
import { securityGrades } from '@etabli/src/utils/security-grade';

// Contrary to the reputation that keeps the best site of an initiative, its weakest site is what matters here
export async function updateInitiativesIndicators(): Promise<number> {
  return await prisma.$executeRaw`
    UPDATE "Initiative" i
    SET
      "httpSecurityGrade" = computed."httpSecurityGrade",
      "tlsLevel" = computed."tlsLevel",
      "tlsIssues" = computed."tlsIssues",
      "mailSecurityLevel" = computed."mailSecurityLevel",
      "mailIssues" = computed."mailIssues",
      "hasLegalNotice" = computed."hasLegalNotice",
      "hasPrivacyPolicy" = computed."hasPrivacyPolicy",
      "foreignDependencyLevel" = computed."foreignDependencyLevel"
    FROM (
      SELECT
        i2."id",
        (
          SELECT hs."grade"
          FROM "RawDomainsOnInitiativeMaps" dm
          INNER JOIN "RawDomain" d ON d."id" = dm."rawDomainId"
          INNER JOIN "DomainHttpSecurity" hs ON hs."domain" = d."name"
          WHERE dm."initiativeMapId" = i2."originId" AND hs."grade" = ANY(${securityGrades}::TEXT[])
          ORDER BY array_position(${securityGrades}::TEXT[], hs."grade") DESC
          LIMIT 1
        ) AS "httpSecurityGrade",
        (
          SELECT MAX(d."tlsLevel")
          FROM "RawDomainsOnInitiativeMaps" dm
          INNER JOIN "RawDomain" d ON d."id" = dm."rawDomainId"
          WHERE dm."initiativeMapId" = i2."originId"
        ) AS "tlsLevel",
        COALESCE(
          (
            SELECT array_agg(DISTINCT issue ORDER BY issue)
            FROM "RawDomainsOnInitiativeMaps" dm
            INNER JOIN "RawDomain" d ON d."id" = dm."rawDomainId"
            CROSS JOIN LATERAL unnest(d."tlsIssues") AS issue
            WHERE dm."initiativeMapId" = i2."originId"
          ),
          ARRAY[]::TEXT[]
        ) AS "tlsIssues",
        (
          SELECT MAX(ms."level")
          FROM "RawDomainsOnInitiativeMaps" dm
          INNER JOIN "RawDomain" d ON d."id" = dm."rawDomainId"
          INNER JOIN "DomainMailSecurity" ms ON ms."domain" = d."name"
          WHERE dm."initiativeMapId" = i2."originId"
        ) AS "mailSecurityLevel",
        COALESCE(
          (
            SELECT array_agg(DISTINCT issue ORDER BY issue)
            FROM "RawDomainsOnInitiativeMaps" dm
            INNER JOIN "RawDomain" d ON d."id" = dm."rawDomainId"
            INNER JOIN "DomainMailSecurity" ms ON ms."domain" = d."name"
            CROSS JOIN LATERAL unnest(ms."issues") AS issue
            WHERE dm."initiativeMapId" = i2."originId"
          ),
          ARRAY[]::TEXT[]
        ) AS "mailIssues",
        (
          SELECT bool_and(d."websiteHasLegalNotice")
          FROM "RawDomainsOnInitiativeMaps" dm
          INNER JOIN "RawDomain" d ON d."id" = dm."rawDomainId"
          WHERE dm."initiativeMapId" = i2."originId"
        ) AS "hasLegalNotice",
        (
          SELECT bool_and(d."websiteHasPrivacyPolicy")
          FROM "RawDomainsOnInitiativeMaps" dm
          INNER JOIN "RawDomain" d ON d."id" = dm."rawDomainId"
          WHERE dm."initiativeMapId" = i2."originId"
        ) AS "hasPrivacyPolicy",
        GREATEST(
          (
            SELECT MAX(ds."level")
            FROM "RawDomainsOnInitiativeMaps" dm
            INNER JOIN "RawDomain" d ON d."id" = dm."rawDomainId"
            INNER JOIN "DomainSovereignty" ds ON ds."domain" = d."name"
            WHERE dm."initiativeMapId" = i2."originId"
          ),
          CASE
            WHEN cardinality(i2."repositories") = 0 THEN NULL
            WHEN EXISTS (
              SELECT 1 FROM unnest(i2."repositories") r WHERE split_part(r, '/', 3) = ANY(${foreignRepositoryHosts}::TEXT[])
            ) THEN 1
            ELSE 0
          END
        ) AS "foreignDependencyLevel"
      FROM "Initiative" i2
      WHERE i2."originId" IS NOT NULL -- Sheets waiting for the next feed have no domain to compute from, their values must be kept meanwhile
    ) computed
    WHERE i."id" = computed."id"
  `;
}

// New pages get it when being retrieved, this one is for pages already stored. It sends no request to websites
export async function updateDomainsLegalLinks(options?: { batchSize?: number }): Promise<number> {
  const batchSize = options?.batchSize ?? 200;
  const virtualConsole = new VirtualConsole(); // Stylesheets of old websites are not always parsable, it's not our concern
  let processedDomains = 0;
  let lastId: string | undefined;

  while (true) {
    watchGracefulExitInLoop();

    const rawDomains = await prisma.rawDomain.findMany({
      where: { websiteRawContent: { not: null }, websiteHasLegalNotice: null, ...(lastId ? { id: { gt: lastId } } : {}) },
      select: { id: true, websiteRawContent: true },
      orderBy: { id: 'asc' },
      take: batchSize,
    });

    if (rawDomains.length === 0) {
      return processedDomains;
    }

    for (const rawDomain of rawDomains) {
      const dom = new JSDOM(rawDomain.websiteRawContent as string, { contentType: 'text/html', virtualConsole: virtualConsole });
      const links = detectLegalLinksFromDocument(dom.window.document);

      dom.window.close();

      await prisma.rawDomain.update({
        where: { id: rawDomain.id },
        data: { websiteHasLegalNotice: links.hasLegalNotice, websiteHasPrivacyPolicy: links.hasPrivacyPolicy },
        select: { id: true },
      });
    }

    processedDomains += rawDomains.length;
    lastId = rawDomains[rawDomains.length - 1].id;

    console.log(`${processedDomains} domains processed`);
  }
}
