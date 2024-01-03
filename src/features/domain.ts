import { getListDiff } from '@donedeal0/superdiff';
import { Prisma } from '@prisma/client';
import { parse } from 'csv-parse';
import fsSync from 'fs';
import fs from 'fs/promises';
import https from 'https';
import { JSDOM } from 'jsdom';
import path from 'path';
import robotsParser from 'robots-parser';
import { PeerCertificate, TLSSocket } from 'tls';
import z from 'zod';

import { downloadFile } from '@etabli/common';
import { getWebsiteData } from '@etabli/features/website';
import { LiteRawDomainSchema, LiteRawDomainSchemaType } from '@etabli/models/entities/raw-domain';
import { rawDomainTypeCsvToModel } from '@etabli/models/mappers/raw-domain';
import { prisma } from '@etabli/prisma';
import { sleep } from '@etabli/utils/sleep';

const serverJsdom = new JSDOM();

export const latestRemoteCsvUrl =
  'https://gitlab.adullact.net/dinum/noms-de-domaine-organismes-secteur-public/-/raw/master/domains.csv?ref_type=heads';
export const localCsvPath = path.resolve(__dirname, '../../data/domains.csv');

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
  const { parseDomain, ParseResultType } = await import('parse-domain'); // Cannot be imported at the top of the file due to being ECMAScript

  const content = await fs.readFile(localCsvPath, 'utf-8');

  parse(
    content,
    {
      columns: true, // Each record as object instead of array
      delimiter: ',',
      cast: true,
      cast_date: true,
      skip_empty_lines: true,
    },
    async (err, records) => {
      if (err) {
        throw new Error('Error parsing CSV:', err);
      }

      const csvDomains: CsvDomainSchemaType[] = records
        .map((record: unknown) => {
          return CsvDomainSchema.parse(record);
        })
        .filter((csvDomain: CsvDomainSchemaType) => {
          // "Only" consider sites returning HTTPS code 200
          // (as of 2023, we consider a website without a valid HTTPS not being worth it. It will simplify in the meantime the analysis of the certificate to aggregate domains)
          //
          // Information for those with a 3xx redirection:
          // - the redirection destination has a high chance to be referenced too if it's legit
          // - domains outside of public gTLD can be purchased by individuals and the redirection could bring to bad websites (fair, the purchased website by someone could end in being the bad website, but this list is ideally supposed to be updated soon enough)
          if (csvDomain.https_status !== '200 OK') {
            return false;
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
            return false;
          }

          const { subDomains } = parsedDomain;
          const isolatedParts: string[] = subDomains.join('.').split(/\.|-|_/);
          if (knownTechnicalPatterns.some((pattern) => isolatedParts.includes(pattern))) {
            return false;
          }

          return true;
        });

      await prisma.$transaction(
        async (tx) => {
          const storedRawDomains = await tx.rawDomain.findMany({
            include: {
              RawDomainsOnInitiativeMaps: true,
            },
          });

          // To make the diff we compare only meaningful properties
          const storedLiteRawDomains = storedRawDomains.map((rawDomain) =>
            LiteRawDomainSchema.parse({
              name: rawDomain.name,
              siren: rawDomain.siren,
              type: rawDomain.type,
              sources: rawDomain.sources,
            })
          );
          const csvLiteDomains = csvDomains.map((csvDomain) =>
            LiteRawDomainSchema.parse({
              name: csvDomain.name,
              siren: csvDomain.SIREN,
              type: rawDomainTypeCsvToModel(csvDomain.type),
              sources: csvDomain.sources,
            })
          );

          const diffResult = getListDiff(storedLiteRawDomains, csvLiteDomains);

          for (const diffItem of diffResult.diff) {
            if (diffItem.status === 'added') {
              const liteRawDomain = diffItem.value as LiteRawDomainSchemaType;

              await tx.rawDomain.create({
                data: {
                  name: liteRawDomain.name,
                  siren: liteRawDomain.siren,
                  type: liteRawDomain.type,
                  sources: liteRawDomain.sources,
                  canBeIndexed: null,
                  updateCanBeIndexed: true,
                  robotsTxtContent: null,
                  wildcardCertificate: null,
                  updateWildcardCertificate: true,
                  certificateContent: null,
                  websiteContent: null,
                  websiteTitle: null,
                  websitePseudoFingerprint: null,
                  updateWebsiteData: true,
                  updateMainSimilarDomain: true,
                },
              });
            } else if (diffItem.status === 'deleted') {
              const liteRawDomain = diffItem.value as LiteRawDomainSchemaType;

              // If it was considered as a main raw domain for some others, we mark those ones to be reprocessed
              await tx.rawDomain.updateMany({
                where: {
                  name: {
                    not: liteRawDomain.name,
                  },
                  mainSimilarDomain: {
                    is: {
                      name: liteRawDomain.name,
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
                  name: liteRawDomain.name,
                },
                include: {
                  RawDomainsOnInitiativeMaps: true,
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
                });
              }
            } else if (diffItem.status === 'updated') {
              const liteRawDomain = diffItem.value as LiteRawDomainSchemaType;

              const updatedRawDomain = await tx.rawDomain.update({
                where: {
                  name: liteRawDomain.name,
                },
                data: {
                  name: liteRawDomain.name,
                  siren: liteRawDomain.siren,
                  type: liteRawDomain.type,
                  sources: liteRawDomain.sources,
                },
                include: {
                  RawDomainsOnInitiativeMaps: true,
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
                });
              }
            }
          }
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        }
      );
    }
  );
}

export async function updateRobotsTxtOnDomains() {
  const rawDomains = await prisma.rawDomain.findMany({
    where: {
      updateCanBeIndexed: true,
    },
    include: {
      RawDomainsOnInitiativeMaps: true,
    },
  });

  for (const rawDomain of rawDomains) {
    const rootUrl = new URL(`https://${rawDomain.name}`);
    const robotsUrl = `${rootUrl.toString()}/robots.txt`;
    const result = await fetch(robotsUrl, {
      redirect: 'error',
    });

    if (result.status >= 200 && result.status < 300) {
      const body = await result.text();

      const robots = robotsParser(robotsUrl, body);
      const canBeIndexed = robots.isAllowed(rootUrl.toString()); // Testing the root pathname is enough to know if the website is indexable or not

      await prisma.rawDomain.update({
        where: {
          id: rawDomain.id,
        },
        data: {
          canBeIndexed: canBeIndexed,
          updateCanBeIndexed: false,
          robotsTxtContent: body,
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
          canBeIndexed: null,
          updateCanBeIndexed: false,
          robotsTxtContent: null,
        },
      });
    }

    // Do not flood network
    await sleep(1000);
  }
}

export async function updateWildcardCertificateOnDomains() {
  const rawDomains = await prisma.rawDomain.findMany({
    where: {
      updateWildcardCertificate: true,
    },
    include: {
      RawDomainsOnInitiativeMaps: true,
    },
  });

  for (const rawDomain of rawDomains) {
    const certificate = await new Promise<PeerCertificate | null>((resolve) => {
      const request = https.request(
        {
          host: rawDomain.name,
          port: 443, // Should always be this one
          method: 'GET',
        },
        (response) => {
          if (response.socket instanceof TLSSocket) {
            resolve(response.socket.getPeerCertificate());
          } else {
            resolve(null);
          }
        }
      );

      request.end();
    });

    await prisma.rawDomain.update({
      where: {
        id: rawDomain.id,
      },
      data: {
        wildcardCertificate: certificate?.issuer.CN === `*.${rawDomain.name}`,
        updateWildcardCertificate: !certificate,
        certificateContent: certificate?.raw.toString() || null,
      },
    });

    // Do not flood network
    await sleep(1000);
  }
}

export async function updateWebsiteDataOnDomains() {
  const rawDomains = await prisma.rawDomain.findMany({
    where: {
      updateWebsiteData: true,
    },
  });

  for (const rawDomain of rawDomains) {
    const url = new URL(`https://${rawDomain.name}`);
    const websiteData = await getWebsiteData(url.toString());

    if (websiteData.status >= 200 && websiteData.status < 300) {
      // We consider the head tag content as a fingerprint common
      // between different environments (dev, staging, production) for the same website.
      // It's not perfect but it's in addition to other filters performed aside this
      const parser = new serverJsdom.window.DOMParser();
      const dom = parser.parseFromString(websiteData.html, 'text/html');

      const headContent = dom.querySelector('head')?.innerHTML;

      await prisma.rawDomain.update({
        where: {
          id: rawDomain.id,
        },
        data: {
          websiteContent: websiteData.html,
          websiteTitle: websiteData.title,
          websitePseudoFingerprint: headContent || null,
          updateWebsiteData: false,
        },
      });
    } else if (websiteData.status > 500) {
      // Website not reachable yet, hope to have it on next attempt
    } else {
      // In case of an error, set to null
      await prisma.rawDomain.update({
        where: {
          id: rawDomain.id,
        },
        data: {
          websiteContent: null,
          websiteTitle: null,
          websitePseudoFingerprint: null,
          updateWebsiteData: false,
        },
      });
    }

    // Do not flood network
    await sleep(1000);
  }
}

export async function matchDomains() {
  // All checks may not be done before matching (due to network errors)
  // but we cannot take the risk of letting alone a domain that would create an additional initiative
  const rawDomainsToUpdate = await prisma.rawDomain.findMany({
    where: {
      updateMainSimilarDomain: true,
    },
  });

  // First look at domains similarity
  const rootRawDomains = await prisma.rawDomain.findMany({
    where: {
      wildcardCertificate: true,
    },
  });

  // In case a subdomain has a wildcard and an upper level too
  // we choose to sort them so it will consider as similar the lower one (due to finding it at first in the list)
  const sortedRootRawDomains = rootRawDomains.sort(function (a, b) {
    // Count dots in the domains since it tells how many level exist
    return (b.name.match(/\./g) || []).length - (a.name.match(/\./g) || []).length;
  });

  for (const rawDomainToUpdate of rawDomainsToUpdate) {
    const rootRawDomain = sortedRootRawDomains.find((d) => {
      // Look for `.abc.com` in case of `subdomain.abc.com`
      return rawDomainToUpdate.name.includes(`.${d.name}`);
    });

    // Also look at head content equivalence
    // (sorting by `createdAt` to be sure the same main similar one is always the first of the list no matter the current one and no matter if others added in the future (to not target another one linked to a main similar one)
    const mainRawDomainClone = await prisma.rawDomain.findFirst({
      where: {
        id: {
          not: rawDomainToUpdate.id,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const similarRawDomain = rootRawDomain || mainRawDomainClone;

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
