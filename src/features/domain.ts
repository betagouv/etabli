import { parse } from 'csv-parse';
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import z from 'zod';

import { downloadFile } from '@etabli/common';

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

export async function saveDomainCsvFile(cache: boolean = true) {
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
    (err, records) => {
      if (err) {
        throw new Error('Error parsing CSV:', err);
      }

      const csvDomains = records
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
          if (csvDomain.https_status === '200 OK') {
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

          const { subDomains, domain, topLevelDomains } = parsedDomain;
          const isolatedParts: string[] = subDomains.join('.').split(/\.|-|_/);
          if (knownTechnicalPatterns.some((pattern) => isolatedParts.includes(pattern))) {
            return false;
          }

          return true;
        });

      // TODO: DEBUG FOR NOW
      console.log(csvDomains.length);
    }
  );
}
