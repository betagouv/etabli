import { Prisma, RawDomain } from '@prisma/client';
import { PrismaClientUnknownRequestError } from '@prisma/client/runtime/library';
import { eachOfLimit } from 'async';
import { parse } from 'csv-parse';
import { minutesToMilliseconds } from 'date-fns/minutesToMilliseconds';
import { subDays } from 'date-fns/subDays';
import fsSync from 'fs';
import fs from 'fs/promises';
import https from 'https';
import { JSDOM, VirtualConsole } from 'jsdom';
import { FetchError } from 'node-fetch';
import { ParseResultType, parseDomain } from 'parse-domain';
import path from 'path';
import { chromium } from 'playwright';
import robotsParser from 'robots-parser';
import { PeerCertificate, TLSSocket } from 'tls';
import z from 'zod';

import { downloadFile } from '@etabli/src/common';
import { getWebsiteData, getWebsiteDataResponse, guessWebsiteNameFromPageTitles } from '@etabli/src/features/website';
import { LitePeerCertificateSchema } from '@etabli/src/models/entities/certificate';
import { BusinessDomainError, unexpectedDomainRedirectionError } from '@etabli/src/models/entities/errors';
import { LiteRawDomainSchema, LiteRawDomainSchemaType } from '@etabli/src/models/entities/raw-domain';
import { rawDomainTypeCsvToModel } from '@etabli/src/models/mappers/raw-domain';
import { prisma } from '@etabli/src/prisma';
import { watchGracefulExitInLoop } from '@etabli/src/server/system';
import { bitsFor } from '@etabli/src/utils/bits';
import { formatDiffResultLog, getDiff } from '@etabli/src/utils/comparaison';
import { formatArrayProgress } from '@etabli/src/utils/format';
import { containsHtml } from '@etabli/src/utils/html';
import { chomiumMaxConcurrency, handlePrismaErrorDueToContent, handleReachabilityError } from '@etabli/src/utils/request';
import { sleep } from '@etabli/src/utils/sleep';

const __root_dirname = process.cwd();

export const latestRemoteCsvUrl =
  'https://gitlab.adullact.net/dinum/noms-de-domaine-organismes-secteur-public/-/raw/master/domains.csv?ref_type=heads';
export const localCsvPath = path.resolve(__root_dirname, './data/domains.csv');

export const CsvDomainTypeSchema = z.enum([
  '',
  'Commune',
  'EPCI',
  'Collectivité',
  'Conseil régional',
  'Bibliothèque',
  'Centre de gestion',
  'Établissement scolaire',
  'Conseil départemental',
  'Université',
  'Ambassade',
  'Académie',
  'MDPH ou MDA',
  'Hôpital',
  'APHP',
  'Ajout Manuel Matthieu Faure',
  'Ministère',
  'Gouvernement',
  'Préfécture',
  'Santé',
]);
export type CsvDomainTypeSchemaType = z.infer<typeof CsvDomainTypeSchema>;

export const CsvDomainSchema = z
  .object({
    name: z.string().min(1).max(500), // The name corresponds to the hostname of the domain `hello.aaa.com` in case of `http://hello.aaa.com:443/`
    http_status: z.string().or(z.number().int()), // Integer is an exception in the list but taking it into account (it's not even a 200 code)
    https_status: z.string().or(z.number().int()), // Integer is an exception in the list but taking it into account (it's not even a 200 code)
    SIREN: z.string(),
    type: CsvDomainTypeSchema,
    sources: z.string(),
    script: z.string(),
  })
  .strict();
export type CsvDomainSchemaType = z.infer<typeof CsvDomainSchema>;

export async function saveDomainCsvFile(cache = true) {
  if (!cache || !fsSync.existsSync(localCsvPath)) {
    await downloadFile(latestRemoteCsvUrl, localCsvPath);
  }
}

export async function formatDomainsIntoDatabase() {
  const parser = fsSync.createReadStream(localCsvPath, 'utf-8').pipe(
    parse({
      columns: true, // Each record as object instead of array
      delimiter: ',',
      cast: true,
      cast_date: true,
      skip_empty_lines: true,
    })
  );

  const csvDomains: CsvDomainSchemaType[] = [];
  for await (const record of parser) {
    const csvDomain = CsvDomainSchema.parse(record);

    // In development environment we reduce the dataset to analyze
    if (process.env.APP_MODE === 'dev' && !csvDomain.name.includes('.beta.gouv.fr')) {
      continue;
    }

    // "Only" consider sites returning HTTPS code 200
    // (as of 2023, we consider a website without a valid HTTPS not being worth it. It will simplify in the meantime the analysis of the certificate to aggregate domains)
    //
    // Information for those with a 3xx redirection:
    // - the redirection destination has a high chance to be referenced too if it's legit
    // - domains outside of public gTLD can be purchased by individuals and the redirection could bring to bad websites (fair, the purchased website by someone could end in being the bad website, but this list is ideally supposed to be updated soon enough)
    if (csvDomain.https_status !== '200 OK') {
      continue;
    }

    // Now filter the best as we can all domains that are not for production:
    // - some technical patterns are regularly used and isolated by separator characters (".", "-")
    // - temporary websites (for review apps for example) can be tricky to catch due to random pattern `app-x2gh58d.example.com` (but since temporary they should not have returned a 200 response)
    const knownTechnicalPatterns: string[] = [
      'api',
      'qa',
      'preview',
      'dev',
      'staging',
      'alpha',
      'beta',
      'test',
      'tst',
      'recette',
      'rec',
      'demo',
      'review',
      'preprod',
      'tmp',
      'pr',
      'chore',
      'feat',
      'fix',
      'ci',
      'deploy',
      'mail',
      'auth',
      'oauth',
      'link',
      'status',
      'ftp',
      'login',
      'wiki',
      'cdn',
      'forum',
    ];

    // Only look at subdomains because some of the main parts could contain technical patterns (even if low probability)
    const parsedDomain = parseDomain(csvDomain.name);
    if (parsedDomain.type !== ParseResultType.Listed) {
      continue;
    }

    const { subDomains } = parsedDomain;
    const isolatedParts: string[] = subDomains.join('.').split(/\.|-|_/);
    if (knownTechnicalPatterns.some((pattern) => isolatedParts.includes(pattern))) {
      continue;
    }

    csvDomains.push(csvDomain);
  }

  await prisma.$transaction(
    async (tx) => {
      const storedRawDomains = await tx.rawDomain.findMany({
        select: {
          id: true,
          name: true,
          siren: true,
          type: true,
          sources: true,
        },
      });

      // To make the diff we compare only meaningful properties
      const storedLiteRawDomains = new Map<LiteRawDomainSchemaType['name'], LiteRawDomainSchemaType>();
      storedRawDomains.forEach((rawDomain) =>
        storedLiteRawDomains.set(
          rawDomain.name,
          LiteRawDomainSchema.parse({
            name: rawDomain.name,
            siren: rawDomain.siren,
            type: rawDomain.type,
            sources: rawDomain.sources,
          })
        )
      );

      const csvLiteDomains: typeof storedLiteRawDomains = new Map();
      csvDomains.forEach((csvDomain) =>
        csvLiteDomains.set(
          csvDomain.name,
          LiteRawDomainSchema.parse({
            name: csvDomain.name,
            siren: csvDomain.SIREN,
            type: rawDomainTypeCsvToModel(csvDomain.type),
            sources: csvDomain.sources,
          })
        )
      );

      const diffResult = getDiff(storedLiteRawDomains, csvLiteDomains);

      console.log(`synchronizing raw domains into the database (${formatDiffResultLog(diffResult)})`);

      await tx.rawDomain.createMany({
        data: diffResult.added.map((addedLiteRawDomain) => ({
          name: addedLiteRawDomain.name,
          siren: addedLiteRawDomain.siren,
          type: addedLiteRawDomain.type,
          sources: addedLiteRawDomain.sources,
          indexableFromRobotsTxt: null,
          updateIndexableFromRobotsTxt: true,
          robotsTxtContent: null,
          wildcardCertificate: null,
          updateWildcardCertificate: true,
          certificateContent: null,
          websiteRawContent: null,
          websiteTitle: null,
          websiteAnotherPageTitle: null,
          websiteInferredName: null,
          websiteHasContent: null,
          websiteHasStyle: null,
          websiteContentIndexable: null,
          websitePseudoFingerprint: null,
          updateWebsiteData: true,
          updateMainSimilarDomain: true,
          lastUpdateAttemptWithReachabilityError: null,
          lastUpdateAttemptReachabilityError: null,
        })),
        skipDuplicates: true,
      });

      for (const deletedLiteRawDomain of diffResult.removed) {
        watchGracefulExitInLoop();

        // If it was considered as a main raw domain for some others, we mark those ones to be reprocessed
        await tx.rawDomain.updateMany({
          where: {
            name: {
              not: deletedLiteRawDomain.name,
            },
            mainSimilarDomain: {
              is: {
                name: deletedLiteRawDomain.name,
              },
            },
          },
          data: {
            mainSimilarDomainId: null,
            updateMainSimilarDomain: true,
          },
        });

        const deletedRawDomain = await tx.rawDomain.delete({
          where: {
            name: deletedLiteRawDomain.name,
          },
          select: {
            RawDomainsOnInitiativeMaps: {
              select: {
                initiativeMapId: true,
              },
            },
          },
        });

        if (deletedRawDomain.RawDomainsOnInitiativeMaps) {
          await tx.initiativeMap.update({
            where: {
              id: deletedRawDomain.RawDomainsOnInitiativeMaps.initiativeMapId,
            },
            data: {
              update: true,
            },
            select: {
              id: true, // Ref: https://github.com/prisma/prisma/issues/6252
            },
          });
        }
      }

      for (const updatedLiteRawDomain of diffResult.updated) {
        watchGracefulExitInLoop();

        const updatedRawDomain = await tx.rawDomain.update({
          where: {
            name: updatedLiteRawDomain.name,
          },
          data: {
            name: updatedLiteRawDomain.name,
            siren: updatedLiteRawDomain.siren,
            type: updatedLiteRawDomain.type,
            sources: updatedLiteRawDomain.sources,
          },
          select: {
            RawDomainsOnInitiativeMaps: {
              select: {
                initiativeMapId: true,
              },
            },
          },
        });

        if (updatedRawDomain.RawDomainsOnInitiativeMaps) {
          await tx.initiativeMap.update({
            where: {
              id: updatedRawDomain.RawDomainsOnInitiativeMaps.initiativeMapId,
            },
            data: {
              update: true,
            },
            select: {
              id: true, // Ref: https://github.com/prisma/prisma/issues/6252
            },
          });
        }
      }
    },
    {
      timeout: minutesToMilliseconds(process.env.NODE_ENV !== 'production' ? 20 : 5), // Since dealing with a lot of data, prevent closing whereas everything is alright
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    }
  );
}

export async function updateRobotsTxtOnDomains() {
  const rawDomains = await prisma.rawDomain.findMany({
    where: {
      updateIndexableFromRobotsTxt: true,
      redirectDomainTargetName: null,
      AND: {
        OR: [
          {
            lastUpdateAttemptWithReachabilityError: {
              equals: null,
            },
          },
          {
            lastUpdateAttemptWithReachabilityError: {
              lt: subDays(new Date(), 1), // Skip rows with high probability of failure since they had recently a network reachability issue
            },
          },
        ],
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  let networkFailures: number = 0;
  for (const [rawDomainIndex, rawDomain] of Object.entries(rawDomains)) {
    watchGracefulExitInLoop();

    console.log(
      `try to process robots.txt for domain ${rawDomain.name} (${rawDomain.id}) ${formatArrayProgress(
        rawDomainIndex,
        rawDomains.length
      )} (${networkFailures}/${rawDomains.length} network issues)`
    );

    try {
      const rootUrl = new URL(`https://${rawDomain.name}`);
      const robotsUrl = `${rootUrl.toString()}robots.txt`;

      let result: Response;
      try {
        result = await fetch(robotsUrl, {
          signal: AbortSignal.timeout(2000), // Tiny timeout otherwise it slows down the whole processing (may be more than a minute of timeout)
        });
      } catch (error) {
        if (error instanceof Error) {
          await handleReachabilityError(rawDomain, error);
          networkFailures++;

          // Skip this one to perform other domains
          continue;
        } else {
          throw error;
        }
      }

      // We want to prevent redirection on another domain to keep integrity but we let pathname redirection pass, so looking at domain only
      const resultingUrl = new URL(result.url);
      if (resultingUrl.host !== rootUrl.host) {
        throw new BusinessDomainError(unexpectedDomainRedirectionError, resultingUrl.hostname);
      }

      if (result.status >= 200 && result.status < 300) {
        const body = await result.text();

        // By default we expect the website to explicitly opt out from crawling (because by default, having no robots.txt to be fully indexed is easier)
        // Note: the HTML tag `<meta name="robots" content="noindex">` may be used to opt out, we check this into the website data processing
        let indexableAccordingToRobotsTxt = true;

        // Some websites have no robots.txt defined and fallback to content (so we don't parse those)
        // Our tiny workaround it to prevent HTML content inside since there is no robots.txt format validator available
        if (!containsHtml(body)) {
          const robots = robotsParser(robotsUrl, body);
          const isAllowed = robots.isAllowed(rootUrl.toString()); // Testing the root pathname is enough to know if the website is indexable or not

          if (isAllowed !== undefined) {
            indexableAccordingToRobotsTxt = isAllowed;
          }
        }

        await prisma.rawDomain.update({
          where: {
            id: rawDomain.id,
          },
          data: {
            indexableFromRobotsTxt: indexableAccordingToRobotsTxt,
            updateIndexableFromRobotsTxt: false,
            robotsTxtContent: body,
            redirectDomainTargetName: null,
            redirectDomainTarget: {
              disconnect: true,
            },
            lastUpdateAttemptWithReachabilityError: null,
            lastUpdateAttemptReachabilityError: null,
          },
          select: {
            id: true, // Ref: https://github.com/prisma/prisma/issues/6252
          },
        });
      } else if (result.status === 404) {
        // If the robots.txt does not exist it means no restriction has been applied, so we consider it as indexable
        await prisma.rawDomain.update({
          where: {
            id: rawDomain.id,
          },
          data: {
            indexableFromRobotsTxt: true,
            updateIndexableFromRobotsTxt: false,
            robotsTxtContent: null,
            redirectDomainTargetName: null,
            redirectDomainTarget: {
              disconnect: true,
            },
            lastUpdateAttemptWithReachabilityError: null,
            lastUpdateAttemptReachabilityError: null,
          },
          select: {
            id: true, // Ref: https://github.com/prisma/prisma/issues/6252
          },
        });
      } else if (result.status > 500) {
        // Website not reachable yet, hope to have it on next attempt
      } else {
        // In case of an error, set to null
        await prisma.rawDomain.update({
          where: {
            id: rawDomain.id,
          },
          data: {
            indexableFromRobotsTxt: null,
            updateIndexableFromRobotsTxt: false,
            robotsTxtContent: null,
            lastUpdateAttemptWithReachabilityError: null,
            lastUpdateAttemptReachabilityError: null,
          },
          select: {
            id: true, // Ref: https://github.com/prisma/prisma/issues/6252
          },
        });
      }
    } catch (error) {
      if (error instanceof BusinessDomainError && error.code === unexpectedDomainRedirectionError.code) {
        const relatedRawDomain = await prisma.rawDomain.findUnique({
          where: {
            name: error.name,
          },
          select: {
            id: true,
          },
        });

        await prisma.rawDomain.update({
          where: {
            id: rawDomain.id,
          },
          data: {
            updateWebsiteData: false,
            redirectDomainTargetName: error.domain,
            redirectDomainTarget: {
              connect: !!relatedRawDomain
                ? {
                    id: relatedRawDomain.id,
                  }
                : undefined,
              disconnect: !relatedRawDomain,
            },
            lastUpdateAttemptWithReachabilityError: null,
            lastUpdateAttemptReachabilityError: null,
          },
          select: {
            id: true, // Ref: https://github.com/prisma/prisma/issues/6252
          },
        });

        continue;
      } else if (error instanceof PrismaClientUnknownRequestError) {
        handlePrismaErrorDueToContent(error);
      } else {
        throw error;
      }
    }

    // Do not flood network (tiny delay since it's unlikely a lot consecutive domains would be managed by the same provider)
    await sleep(50);
  }
}

export async function updateWildcardCertificateOnDomains() {
  const rawDomains = await prisma.rawDomain.findMany({
    where: {
      updateWildcardCertificate: true,
      redirectDomainTargetName: null,
      AND: {
        OR: [
          {
            lastUpdateAttemptWithReachabilityError: {
              equals: null,
            },
          },
          {
            lastUpdateAttemptWithReachabilityError: {
              lt: subDays(new Date(), 1), // Skip rows with high probability of failure since they had recently a network reachability issue
            },
          },
        ],
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  let networkFailures: number = 0;
  for (const [rawDomainIndex, rawDomain] of Object.entries(rawDomains)) {
    watchGracefulExitInLoop();

    console.log(
      `try to process SSL certificate for domain ${rawDomain.name} (${rawDomain.id}) ${formatArrayProgress(
        rawDomainIndex,
        rawDomains.length
      )} (${networkFailures}/${rawDomains.length} network issues)`
    );

    let toSkip: boolean = false;
    const certificate = await new Promise<PeerCertificate | null>((resolve, reject) => {
      const request = https.request(
        {
          host: rawDomain.name,
          port: 443, // Should always be this one
          method: 'GET',
          signal: AbortSignal.timeout(2000), // Tiny timeout otherwise it slows down the whole processing (may be more than a minute of timeout)
        },
        (response) => {
          if (response.socket instanceof TLSSocket) {
            resolve(response.socket.getPeerCertificate());
          } else {
            resolve(null);
          }
        }
      );

      request.on('error', async (error) => {
        try {
          if (error instanceof Error) {
            await handleReachabilityError(rawDomain, error);
            networkFailures++;

            // Skip this one to perform other domains
            toSkip = true;
            resolve(null);
          } else {
            throw error;
          }
        } catch (catcherError) {
          reject(error);
        }
      });

      request.end();
    });

    if (toSkip) {
      continue;
    }

    // The content has no defined structure, we just kept the library format to debug if needed main processed values as it comes
    let certificateContent: object | null = null;
    if (certificate) {
      const deepcopyContent = JSON.parse(JSON.stringify(certificate));
      certificateContent = LitePeerCertificateSchema.parse(deepcopyContent); // To only keep wanted values (excluding unreadable values)
    }

    await prisma.rawDomain.update({
      where: {
        id: rawDomain.id,
      },
      data: {
        wildcardCertificate: certificate?.issuer.CN === `*.${rawDomain.name}`,
        updateWildcardCertificate: !certificate,
        certificateContent: certificateContent ? JSON.stringify(certificateContent) : null,
        lastUpdateAttemptWithReachabilityError: null,
        lastUpdateAttemptReachabilityError: null,
      },
      select: {
        id: true, // Ref: https://github.com/prisma/prisma/issues/6252
      },
    });

    // Do not flood network (tiny delay since it's unlikely a lot consecutive domains would be managed by the same provider)
    await sleep(50);
  }
}

export async function updateWebsiteDataOnDomains() {
  const rawDomains = await prisma.rawDomain.findMany({
    where: {
      updateWebsiteData: true,
      redirectDomainTargetName: null,
      AND: {
        OR: [
          {
            lastUpdateAttemptWithReachabilityError: {
              equals: null,
            },
          },
          {
            lastUpdateAttemptWithReachabilityError: {
              lt: subDays(new Date(), 1), // Skip rows with high probability of failure since they had recently a network reachability issue
            },
          },
        ],
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  // Create a virtual JSDOM console when parsing fetched content because sometimes it fails
  // parsing CSS from websites, and since we do not care about this we just want to silent this kind of error
  // Ref: https://github.com/jsdom/jsdom/issues/2177#issuecomment-772815161
  const virtualConsole = new VirtualConsole();
  virtualConsole.sendTo(console, { omitJSDOMErrors: true });
  virtualConsole.on('jsdomError', (err) => {
    if (err.message !== 'Could not parse CSS stylesheet') {
      console.error(err);
    }
  });

  let networkFailures: number = 0;
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  try {
    // Since the underlying content fetching is based on waiting a timeout on the website "to be sure" single page applications (SPA)
    // have rendered their content, it takes some time in the iteration are consecutives. Due to that we allowed the loop batching
    // Note: for a concurrency of 1 in average it was 6 seconds per website (since to 2 pages renderings with an await)
    await eachOfLimit(rawDomains, chomiumMaxConcurrency, async function (rawDomain, rawDomainIndex) {
      watchGracefulExitInLoop();

      console.log(
        `try to process website content for domain ${rawDomain.name} (${rawDomain.id}) ${formatArrayProgress(
          rawDomainIndex,
          rawDomains.length
        )} (${networkFailures}/${rawDomains.length} network issues)`
      );

      try {
        const url = new URL(`https://${rawDomain.name}`);

        let websiteData: getWebsiteDataResponse;
        try {
          websiteData = await getWebsiteData(browser, url.toString(), 5000);
        } catch (error) {
          if (error instanceof BusinessDomainError) {
            // This is not only related to the network, so pass them to the upper catcher
            throw error;
          } else if (error instanceof Error) {
            await handleReachabilityError(rawDomain, error);
            networkFailures++;

            // Skip this one to perform other domains
            return;
          } else {
            throw error;
          }
        }

        if (websiteData.status >= 200 && websiteData.status < 300) {
          if (containsHtml(websiteData.html)) {
            // Some websites have bundled their assets/libraries (CSS/JS) into their HTML code, which makes it huge
            // There are just a few so we can handle this but still we set a 5 MB limit for the HTML to be store in case a website would fill up too much the database storage
            if (new Blob([websiteData.html]).size > 5 * bitsFor.MiB) {
              console.log(`the html content is considered too big to be stored in the database for further processing`);

              return;
            }

            // We consider the head tag content as a fingerprint common
            // between different environments (dev, staging, production) for the same website.
            // It's not perfect but it's in addition to other filters performed aside this
            const dom = new JSDOM(websiteData.html, {
              url: url.toString(),
              contentType: 'text/html',
              virtualConsole: virtualConsole,
            });

            const headContent = dom.window.document.head.innerHTML;
            const hasStyle = dom.window.document.querySelectorAll('link[rel="stylesheet"], style').length > 0;

            // Since looking at text content would include content from `script` and `noscript` tags, we do proper analysis aside
            const deepcopyBody = dom.window.document.body.cloneNode(true) as HTMLElement;
            deepcopyBody.querySelectorAll('script, noscript').forEach((element) => {
              element.parentNode?.removeChild(element);
            });
            const contentText = deepcopyBody.textContent?.trim();
            const hasContent = !!contentText && contentText !== '';

            // A missing `noindex` means it can be indexed in this context (don't forget a `robots.txt`)
            // Note: we don't look at specific crawler restriction because we only want to know if the website is considered "private" or not
            const indexableMetaElement = dom.window.document.querySelector('meta[name="robots"]');
            const isIndexableAccordingToThisContentOnly = indexableMetaElement ? indexableMetaElement.getAttribute('content') !== 'noindex' : true;
            const isIndexableAccordingToHeadersOnly = websiteData.headers['x-robots-tag'] !== 'noindex'; // As for the `meta` tag, is not globally `noindex` we don't try to parse other form of complexity since it's unlikely formatted like that (and also no header parser library exists for this case)
            const isIndexableAccordingToWebsiteData = isIndexableAccordingToThisContentOnly && isIndexableAccordingToHeadersOnly;

            const websiteNameMetaElement = dom.window.document.querySelector('meta[name="application-name"]');
            const properWebsiteName = websiteNameMetaElement?.getAttribute('content') || null;

            // If no proper website name, find another page of this website to infer website name according to 2 titles
            // Note: if not working perflectly we could count how many `/` into the path, and sort links to look for the link with fewer "/" (indicating a main page)
            // Note: by specifying the `url` with `JSDOM` it turns relative paths into absolute ones (which is ideal to browse across)
            let anotherPageTitle: string | null = null;
            if (!properWebsiteName) {
              const links = dom.window.document.querySelectorAll('a');
              for (const link of links) {
                try {
                  // Reset the "hash" because in most case it's just targetting a section of the same page
                  // So we cannot consider it as another page (even it may in a few cases of Single Page Application)
                  // (not necessary on the initial `url` because built from manually from a raw domain)
                  const parsedLink = new URL(link.href);
                  parsedLink.hash = '';
                  const cleanLink = parsedLink.toString();

                  if (websiteData.redirectTargetUrl) {
                    websiteData.redirectTargetUrl.hash = '';
                  }

                  // We also consider excluding the URL in case of a redirection or a `window.replace` from the website, or if the page targets itself
                  if (
                    cleanLink.startsWith(url.toString()) &&
                    cleanLink !== url.toString() &&
                    (!websiteData.redirectTargetUrl || cleanLink !== websiteData.redirectTargetUrl.toString())
                  ) {
                    const anotherPageUrl = cleanLink;

                    // Wait a bit to not flood this website (tiny delay in this loop because it's just the second request to this domain in this iteration)
                    await sleep(50);

                    let anotherPageData: getWebsiteDataResponse;
                    try {
                      anotherPageData = await getWebsiteData(browser, anotherPageUrl.toString(), 5000);
                    } catch (error) {
                      if (error instanceof BusinessDomainError) {
                        // This is not only related to the network, so pass them to the upper catcher
                        throw error;
                      } else if (error instanceof Error) {
                        await handleReachabilityError(rawDomain, error);
                        networkFailures++;

                        // Skip this one to perform other domains
                        return;
                      } else {
                        throw error;
                      }
                    }

                    if (anotherPageData.status >= 200 && anotherPageData.status < 300) {
                      anotherPageTitle = anotherPageData.title;
                    }

                    break;
                  }
                } catch (error) {
                  // The `href` may not be a valid URL, just skip this link
                  return;
                }
              }
            }

            // Try to find a link to a repository by only looking at header, sidebar, footer
            // to avoid links that could be written into posts or so
            // By default we look at main repository forges
            let sourceForgesDomains = ['github.com', 'gitlab.com', 'bitbucket.org'];

            // But we look at other forges that are used when the repositories table is filled (it improves the search)
            const additionalForgesDomainsThroughRepositories = await prisma.rawRepository.findMany({
              where: {},
              distinct: ['probableWebsiteDomain'],
              select: {
                repositoryDomain: true,
                probableWebsiteDomain: true,
              },
            });

            sourceForgesDomains.push(...additionalForgesDomainsThroughRepositories.map((proxyRepository) => proxyRepository.repositoryDomain));
            sourceForgesDomains = [...new Set(sourceForgesDomains)];

            const matchingLinks: string[] = [];
            const linksForRepository = dom.window.document.querySelectorAll('header a, footer a, nav a, aside a');
            for (const linkElement of linksForRepository) {
              try {
                const parsedUrl = new URL((linkElement as HTMLAnchorElement).href);

                if (sourceForgesDomains.includes(parsedUrl.hostname)) {
                  matchingLinks.push(parsedUrl.toString());
                }
              } catch (error) {
                // Silent :)
              }
            }

            let probableRepositoryUrl: URL | null = null;

            // We consider the website lists its own repository if only 1 pseudo-repository link is found (we make unique filter over the array)
            if ([...new Set(matchingLinks)].length === 1) {
              probableRepositoryUrl = new URL(matchingLinks[0]);
            }

            await prisma.rawDomain.update({
              where: {
                id: rawDomain.id,
              },
              data: {
                websiteRawContent: websiteData.html,
                websiteTitle: !properWebsiteName ? websiteData.title : null,
                websiteAnotherPageTitle: !properWebsiteName ? anotherPageTitle : null,
                websiteInferredName:
                  properWebsiteName ||
                  (websiteData.title && anotherPageTitle ? guessWebsiteNameFromPageTitles(websiteData.title, anotherPageTitle) : null),
                websiteHasContent: hasContent,
                websiteHasStyle: hasStyle,
                websiteContentIndexable: isIndexableAccordingToWebsiteData,
                websitePseudoFingerprint: headContent || null,
                probableRepositoryUrl: probableRepositoryUrl?.toString() || null,
                probableRepositoryDomain: probableRepositoryUrl?.hostname || null,
                updateWebsiteData: false,
                redirectDomainTargetName: null,
                redirectDomainTarget: {
                  disconnect: true,
                },
                lastUpdateAttemptWithReachabilityError: null,
                lastUpdateAttemptReachabilityError: null,
              },
              select: {
                id: true, // Ref: https://github.com/prisma/prisma/issues/6252
              },
            });
          } else {
            await prisma.rawDomain.update({
              where: {
                id: rawDomain.id,
              },
              data: {
                websiteRawContent: websiteData.html,
                websiteTitle: null,
                websiteAnotherPageTitle: null,
                websiteInferredName: rawDomain.name,
                websiteHasContent: false,
                websiteHasStyle: false,
                websiteContentIndexable: true, // Since no specific tag, we consider it as indexable even if we won't due to missing HTML content
                websitePseudoFingerprint: null,
                updateWebsiteData: false,
                lastUpdateAttemptWithReachabilityError: null,
                lastUpdateAttemptReachabilityError: null,
              },
              select: {
                id: true, // Ref: https://github.com/prisma/prisma/issues/6252
              },
            });
          }
        } else if (websiteData.status > 500) {
          // Website not reachable yet, hope to have it on next attempt
        } else {
          // In case of an error, set to null
          await prisma.rawDomain.update({
            where: {
              id: rawDomain.id,
            },
            data: {
              websiteRawContent: null,
              websiteTitle: null,
              websiteAnotherPageTitle: null,
              websiteInferredName: null,
              websiteHasContent: null,
              websiteHasStyle: null,
              websiteContentIndexable: null,
              websitePseudoFingerprint: null,
              updateWebsiteData: false,
              lastUpdateAttemptWithReachabilityError: null,
              lastUpdateAttemptReachabilityError: null,
            },
            select: {
              id: true, // Ref: https://github.com/prisma/prisma/issues/6252
            },
          });
        }
      } catch (error) {
        if (error instanceof BusinessDomainError && error.code === unexpectedDomainRedirectionError.code) {
          const relatedRawDomain = await prisma.rawDomain.findUnique({
            where: {
              name: error.name,
            },
            select: {
              id: true,
            },
          });

          await prisma.rawDomain.update({
            where: {
              id: rawDomain.id,
            },
            data: {
              updateWebsiteData: false,
              redirectDomainTargetName: error.domain,
              redirectDomainTarget: {
                connect: !!relatedRawDomain
                  ? {
                      id: relatedRawDomain.id,
                    }
                  : undefined,
                disconnect: !relatedRawDomain,
              },
              lastUpdateAttemptWithReachabilityError: null,
              lastUpdateAttemptReachabilityError: null,
            },
            select: {
              id: true, // Ref: https://github.com/prisma/prisma/issues/6252
            },
          });

          return;
        } else if (error instanceof PrismaClientUnknownRequestError) {
          handlePrismaErrorDueToContent(error);
        } else {
          throw error;
        }
      }

      // Do not flood network (tiny delay since it's unlikely a lot consecutive domains would be managed by the same provider)
      await sleep(50);
    });
  } finally {
    await browser.close();
  }
}

export async function matchDomains() {
  // All checks may not be done before matching (due to network errors)
  // but we cannot take the risk of letting alone a domain that would create an additional initiative

  const rawDomainsToUpdate = await prisma.$transaction(
    async (tx) => {
      // We had to split the `findMany` into multiple chunks due to a mystic Prisma issue
      // This is due to fetching too much data (`websitePseudoFingerprint` in this case) (ref: https://github.com/prisma/prisma/issues/13864#issuecomment-1966122882)
      const chunkSize = 10_000;
      const items: Pick<RawDomain, 'id' | 'name' | 'websitePseudoFingerprint'>[] = [];

      while (true) {
        const chunkItems = await tx.rawDomain.findMany({
          where: {
            updateMainSimilarDomain: true,
            redirectDomainTargetName: null,
          },
          select: {
            id: true,
            name: true,
            websitePseudoFingerprint: true,
          },
          skip: items.length,
          take: chunkSize,
        });

        items.push(...chunkItems);

        console.log(`currently retrieved ${items.length} raw domains with the splitted fetcher`);

        if (chunkItems.length < chunkSize) {
          break;
        }
      }

      return items;
    },
    {
      timeout: minutesToMilliseconds(process.env.NODE_ENV !== 'production' ? 5 : 2), // Since dealing with a lot of data, prevent closing whereas everything is alright
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    }
  );

  // First look at domains similarity
  const rootRawDomains = await prisma.rawDomain.findMany({
    where: {
      wildcardCertificate: true,
    },
    select: {
      id: true,
      name: true,
    },
  });

  // In case a subdomain has a wildcard and an upper level too
  // we choose to sort them so it will consider as similar the lower one (due to finding it at first in the list)
  const sortedRootRawDomains = rootRawDomains.sort(function (a, b) {
    // Count dots in the domains since it tells how many level exist
    return (b.name.match(/\./g) || []).length - (a.name.match(/\./g) || []).length;
  });

  for (const [rawDomainToUpdateIndex, rawDomainToUpdate] of Object.entries(rawDomainsToUpdate)) {
    watchGracefulExitInLoop();

    console.log(
      `try to bind similar domains to domain ${rawDomainToUpdate.name} (${rawDomainToUpdate.id}) ${formatArrayProgress(
        rawDomainToUpdateIndex,
        rawDomainsToUpdate.length
      )}`
    );

    const rootRawDomain = sortedRootRawDomains.find((d) => {
      // Look for `.abc.com` in case of `subdomain.abc.com`
      return rawDomainToUpdate.name.includes(`.${d.name}`);
    });

    // Also look at head content equivalence but only under the same top domain to avoid conflicting with other websites
    // Note: most of the time development environments should be marked as not indexable so they won't end into the listing
    // (sorting by `createdAt` to be sure the same main similar one is always the first of the list no matter the current one and no matter if others added in the future (to not target another one linked to a main similar one)
    let mainSameParentDomainClone: Pick<RawDomain, 'id' | 'name'> | null = null;

    if (!!rawDomainToUpdate.websitePseudoFingerprint) {
      const mainRawDomainClones = await prisma.rawDomain.findMany({
        where: {
          id: {
            // Note: we switched to not exclude the current repository to have the top item for all similar ones
          },
          websitePseudoFingerprint: rawDomainToUpdate.websitePseudoFingerprint,
        },
        select: {
          id: true,
          name: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      const parsedCurrentDomain = parseDomain(rawDomainToUpdate.name);
      if (parsedCurrentDomain.type === ParseResultType.Listed && parsedCurrentDomain.subDomains.length > 0) {
        const currentDomainCompareString = `${parsedCurrentDomain.domain}.${parsedCurrentDomain.topLevelDomains.join('.')}`;

        mainSameParentDomainClone =
          mainRawDomainClones.find((rawDomainClone) => {
            const parsedCloneDomain = parseDomain(rawDomainClone.name);

            if (
              parsedCloneDomain.type === ParseResultType.Listed &&
              currentDomainCompareString === `${parsedCloneDomain.domain}.${parsedCloneDomain.topLevelDomains.join('.')}`
            ) {
              return true;
            }

            return false;
          }) || null;

        if (
          rawDomainToUpdate.id === mainSameParentDomainClone?.id || // See `where` condition with `findMany()` to understand why the logic was moved here
          (!!rootRawDomain && mainSameParentDomainClone?.name.includes(`.${rootRawDomain.name}`)) // If it would be considered as linked to the same wildcard certificate, exclude it to not break the tree direction
        ) {
          mainSameParentDomainClone = null;
        }
      }
    }

    // TODO: some websites may use the same code (the same shell) with different sets of data. A solution can be to look
    // at equivalent inferred website name under a same subdomain/domain (exclundig gTLD). It allows gathering cloned sites but
    // the negative side is: which one to process? None? If one, how to tell it's more important than other...
    const similarRawDomain = rootRawDomain || mainSameParentDomainClone;

    await prisma.rawDomain.update({
      where: {
        id: rawDomainToUpdate.id,
      },
      data: {
        mainSimilarDomain: {
          connect: similarRawDomain
            ? {
                id: similarRawDomain.id,
              }
            : undefined,
          disconnect: !similarRawDomain ? true : undefined,
        },
        updateMainSimilarDomain: false,
      },
      select: {
        id: true, // Ref: https://github.com/prisma/prisma/issues/6252
      },
    });
  }
}

export async function enhanceDomainsIntoDatabase() {
  // We do not parallelize with `Promise.all` to have
  // logs readable to not flood the network and be consider as a bad actor
  await updateRobotsTxtOnDomains();
  await updateWildcardCertificateOnDomains();
  await updateWebsiteDataOnDomains();
  await matchDomains();
}
