import { differenceInDays } from 'date-fns/differenceInDays';
import { minutesToMilliseconds } from 'date-fns/minutesToMilliseconds';
import { secondsToMilliseconds } from 'date-fns/secondsToMilliseconds';
import { subDays } from 'date-fns/subDays';
import { subMonths } from 'date-fns/subMonths';
import fs from 'fs/promises';
import linkifyit from 'linkify-it';
import path from 'path';
import z from 'zod';

import { downloadFile, isFileOutdated } from '@etabli/src/common';
import { Prisma, RawRepository } from '@etabli/src/generated/prisma/client';
import { LiteRawRepositorySchema, LiteRawRepositorySchemaType } from '@etabli/src/models/entities/raw-repository';
import { rawRepositoryPlatformJsonToModel } from '@etabli/src/models/mappers/raw-repository';
import { prisma } from '@etabli/src/prisma';
import { watchGracefulExitInLoop } from '@etabli/src/server/system';
import { formatDiffResultLog, getDiff } from '@etabli/src/utils/comparaison';
import { formatArrayProgress } from '@etabli/src/utils/format';
import { sleep } from '@etabli/src/utils/sleep';
import { emptyStringtoNullPreprocessor } from '@etabli/src/utils/validation';

const __root_dirname = process.cwd();
const linkify = linkifyit();

// We did not used the CSV format even if less heavy to avoid extra parsing for numbers, null, string on multiple lines... (ref: https://code.gouv.fr/data/repositories/csv/all.csv)

// This file is frozen since 2024-11-08 but stays needed: `data.code.gouv.fr` does not know some forges and its GitLab ones are not refreshed
export const latestRemoteJsonUrl = 'https://code.gouv.fr/data/repositories/json/all.json';
export const localJsonPath = path.resolve(__root_dirname, './data/repositories.json');

// Instance of ecosyste.ms maintained for code.gouv.fr, it has no export so everything comes from its paginated API
export const ecosystemApiUrl = 'https://data.code.gouv.fr/api/v1';
export const localEcosystemJsonPath = path.resolve(__root_dirname, './data/repositories-ecosystem.json');
const ecosystemPageSize = 100;

// Last export before code.gouv.fr stopped its inventory, it only brings a few repositories the 2 others lists do not have
export const latestRemoteLastInventoryJsonUrl = 'https://code.gouv.fr/data/codegouvfr-repositories.json';
export const localLastInventoryJsonPath = path.resolve(__root_dirname, './data/repositories-last-inventory.json');

export const JsonRepositoryPlatformSchema = z.enum(['GitHub', 'GitLab']);
export type JsonRepositoryPlatformSchemaType = z.infer<typeof JsonRepositoryPlatformSchema>;

export const JsonRepositorySchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1).max(500), // Repository name
    organization_name: z.string().min(1).max(500), // Repository organization
    platform: JsonRepositoryPlatformSchema,
    repository_url: z.string().url(),
    description: emptyStringtoNullPreprocessor(z.string().min(1).max(2000).nullable()),
    default_branch: z.string().min(1),
    is_fork: z.boolean().nullable(),
    is_archived: z.boolean(),
    creation_date: z.string().pipe(z.coerce.date()),
    last_update: z.string().pipe(z.coerce.date()),
    last_modification: z.string().pipe(z.coerce.date()),
    homepage: z.preprocess((v) => {
      // Some links have an invalid format, we just skip them since a missing protocol, missing extension, or something else is hard to guess
      try {
        new URL(v as string);

        return v;
      } catch (error) {
        return null;
      }
    }, emptyStringtoNullPreprocessor(z.string().url().nullable())),
    stars_count: z.number().nonnegative(),
    forks_count: z.number().nonnegative(),
    license: z.string().nullable(),
    open_issues_count: z.number().nonnegative(),
    language: z.string().min(1).nullable(),
    topics: emptyStringtoNullPreprocessor(z.string().min(1).max(1000).nullable()),
    software_heritage_exists: z.boolean().nullable(),
    software_heritage_url: z.string().url().nullable(),
  })
  .strict();
export type JsonRepositorySchemaType = z.infer<typeof JsonRepositorySchema>;

export const EcosystemHostSchema = z.object({
  name: z.string().min(1),
  kind: z.string().min(1),
  repositories_count: z.number().nonnegative(),
});
export type EcosystemHostSchemaType = z.infer<typeof EcosystemHostSchema>;

export const EcosystemRepositorySchema = z.object({
  id: z.number().int().positive(),
  html_url: z.string().url(),
  owner: z.string().min(1),
  kind: z.string().min(1), // Coming from the host
  description: z.string().nullable(),
  default_branch: z.string().nullable(),
  fork: z.boolean().nullable(),
  archived: z.boolean().nullable(),
  created_at: z.string().pipe(z.coerce.date()),
  updated_at: z.string().pipe(z.coerce.date()),
  pushed_at: z.string().pipe(z.coerce.date()).nullable(),
  homepage: z.string().nullable(),
  stargazers_count: z.number().nullable(),
  forks_count: z.number().nullable(),
  license: z.string().nullable(),
  open_issues_count: z.number().nullable(),
  language: z.string().nullable(),
  topics: z.array(z.string()),
});
export type EcosystemRepositorySchemaType = z.infer<typeof EcosystemRepositorySchema>;

export const LastInventoryRepositorySchema = z.object({
  id: z.string().url(), // It's the repository URL
  owner: z.string().url(),
  platform: z.string().min(1),
  description: z.string().nullable(),
  fork: z.boolean().nullable(),
  archived: z.boolean().nullable(),
  updated_at: z.string().pipe(z.coerce.date()),
  forks_count: z.number().nullable(),
  license: z.string().nullable(),
  language: z.string().nullable(),
});
export type LastInventoryRepositorySchemaType = z.infer<typeof LastInventoryRepositorySchema>;

async function fetchEcosystemJson(url: string): Promise<unknown> {
  const maximumAttempts = 3;

  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(secondsToMilliseconds(60)) });

      if (!response.ok) {
        throw new Error(`failed to fetch ${url}: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (attempt === maximumAttempts) {
        throw error;
      }

      await sleep(secondsToMilliseconds(5 * attempt));
    }
  }
}

// A few malformed records from external lists are skipped instead of losing the whole import, but beyond this share the format
// has probably changed and going on would remove the skipped repositories from the database
const maximumInvalidRepositoriesShare = 0.01;

function assertUsableRepositoryList(listName: string, recordsCount: number, invalidRecordsCount: number) {
  if (invalidRecordsCount > 0) {
    console.warn(`${invalidRecordsCount}/${recordsCount} records of the ${listName} list are malformed and skipped`);
  }

  if (recordsCount > 0 && invalidRecordsCount / recordsCount > maximumInvalidRepositoriesShare) {
    throw new Error(`the ${listName} list cannot be trusted since ${invalidRecordsCount}/${recordsCount} records are malformed`);
  }
}

// Repositories can be added or removed while paging through a host (it takes minutes for the biggest ones), so a small gap is expected
function isAcceptableRepositoriesCountGap(expectedCount: number, retrievedCount: number): boolean {
  return Math.abs(expectedCount - retrievedCount) <= Math.max(5, Math.ceil(expectedCount * 0.005));
}

// The file is written once everything is retrieved, because a partial list would remove the missing repositories from the database
export async function saveEcosystemRepositoryListFile() {
  const hosts = z.array(EcosystemHostSchema).parse(await fetchEcosystemJson(`${ecosystemApiUrl}/hosts`));
  const repositories: EcosystemRepositorySchemaType[] = [];
  let recordsCount = 0;
  let invalidRecordsCount = 0;

  for (const host of hosts) {
    watchGracefulExitInLoop();

    let hostRepositoriesCount = 0;
    const hostRepositoriesIds = new Set<number>(); // Offset paging can give the same record twice when the list moves meanwhile

    for (let page = 1; ; page++) {
      const records = z
        .array(z.record(z.string(), z.unknown()))
        .parse(
          await fetchEcosystemJson(
            `${ecosystemApiUrl}/hosts/${encodeURIComponent(host.name)}/repositories?per_page=${ecosystemPageSize}&page=${page}&sort=id&order=asc`
          )
        );

      for (const record of records) {
        const parsedRecord = EcosystemRepositorySchema.safeParse({ ...record, kind: host.kind });

        recordsCount++;

        if (!parsedRecord.success) {
          invalidRecordsCount++;
        } else if (!hostRepositoriesIds.has(parsedRecord.data.id)) {
          hostRepositoriesIds.add(parsedRecord.data.id);
          repositories.push(parsedRecord.data);
        }
      }

      hostRepositoriesCount += records.length;

      if (records.length < ecosystemPageSize) {
        break;
      }

      await sleep(150); // To be gentle with the API
    }

    if (!isAcceptableRepositoriesCountGap(host.repositories_count, hostRepositoriesCount)) {
      throw new Error(`${host.name} should have ${host.repositories_count} repositories but ${hostRepositoriesCount} have been retrieved`);
    }
  }

  assertUsableRepositoryList('ecosystem', recordsCount, invalidRecordsCount);

  await fs.mkdir(path.dirname(localEcosystemJsonPath), { recursive: true });
  await fs.writeFile(localEcosystemJsonPath, JSON.stringify(repositories));
}

export async function saveRepositoryListFile(cache = true) {
  if (!cache || (await isFileOutdated(localJsonPath))) {
    await downloadFile(latestRemoteJsonUrl, localJsonPath);
  }

  if (!cache || (await isFileOutdated(localEcosystemJsonPath))) {
    await saveEcosystemRepositoryListFile();
  }

  if (!cache || (await isFileOutdated(localLastInventoryJsonPath))) {
    await downloadFile(latestRemoteLastInventoryJsonUrl, localLastInventoryJsonPath);
  }
}

function getRepositoryKey(repositoryUrl: string): string {
  return repositoryUrl.replace(/(\/|\.git)$/, '').toLowerCase();
}

function ecosystemRepositoryToJson(
  repository: EcosystemRepositorySchemaType & { default_branch: string },
  known?: JsonRepositorySchemaType
): JsonRepositorySchemaType {
  return JsonRepositorySchema.parse({
    id: repository.id,
    name: new URL(repository.html_url).pathname.split('/').pop(),
    organization_name: repository.owner,
    platform: repository.kind === 'github' ? 'GitHub' : 'GitLab',
    repository_url: known?.repository_url ?? repository.html_url, // Its case can differ and the URL identifies a repository in the database
    description: repository.description,
    default_branch: repository.default_branch,
    is_fork: repository.fork || repository.kind === 'github' ? repository.fork : null, // Other forges fall back on what the description says
    is_archived: repository.archived ?? known?.is_archived ?? false,
    creation_date: repository.created_at.toISOString(),
    last_update: repository.updated_at.toISOString(),
    last_modification: (repository.pushed_at ?? repository.updated_at).toISOString(),
    homepage: repository.homepage,
    stars_count: repository.stargazers_count ?? 0,
    forks_count: repository.forks_count ?? 0,
    license: repository.license || null, // Some exports use empty strings
    open_issues_count: repository.open_issues_count ?? 0,
    language: repository.language || null,
    topics: repository.topics.join(','),
    software_heritage_exists: known?.software_heritage_exists ?? null,
    software_heritage_url: known?.software_heritage_url ?? null,
  });
}

function lastInventoryRepositoryToEcosystem(repository: LastInventoryRepositorySchemaType, index: number): EcosystemRepositorySchemaType {
  return {
    id: index + 1,
    html_url: repository.id,
    owner: new URL(repository.owner).pathname.split('/').pop() as string,
    kind: repository.platform === 'github.com' ? 'github' : 'gitlab',
    description: repository.description,
    default_branch: 'main', // This export does not provide it, but it's not used since the clone relies on the repository default one
    fork: repository.fork,
    archived: repository.archived,
    created_at: repository.updated_at, // Not provided either
    updated_at: repository.updated_at,
    pushed_at: null,
    homepage: null,
    stargazers_count: null,
    forks_count: repository.forks_count,
    license: repository.license,
    open_issues_count: null,
    language: repository.language,
    topics: [],
  };
}

export interface RepositoryRename {
  fromUrl: string;
  toKey: string;
}

// The frozen list still has the former address of repositories renamed or transferred since, while the refreshed list only has the new one.
// Both keep the creation date to the second, so a repository only known by the frozen list with a single refreshed one created at the exact
// same time on the same forge is the same. Only GitHub is considered because other forges can give dates rounded to the day
export function findRenamedRepositories(
  jsonRepositories: JsonRepositorySchemaType[],
  ecosystemRepositories: EcosystemRepositorySchemaType[]
): RepositoryRename[] {
  const ecosystemKeys = new Set(ecosystemRepositories.map((repository) => getRepositoryKey(repository.html_url)));
  const ecosystemRepositoriesByCreation = new Map<string, EcosystemRepositorySchemaType[]>();

  for (const repository of ecosystemRepositories) {
    if (repository.kind !== 'github' || repository.default_branch === null) {
      continue;
    }

    const creationKey = repository.created_at.toISOString();
    const sameCreationRepositories = ecosystemRepositoriesByCreation.get(creationKey) ?? [];

    sameCreationRepositories.push(repository);
    ecosystemRepositoriesByCreation.set(creationKey, sameCreationRepositories);
  }

  const renames: RepositoryRename[] = [];

  for (const repository of jsonRepositories) {
    const key = getRepositoryKey(repository.repository_url);

    if (repository.platform !== 'GitHub' || ecosystemKeys.has(key)) {
      continue;
    }

    const sameCreationRepositories = ecosystemRepositoriesByCreation.get(repository.creation_date.toISOString()) ?? [];

    if (sameCreationRepositories.length === 1) {
      renames.push({ fromUrl: repository.repository_url, toKey: getRepositoryKey(sameCreationRepositories[0].html_url) });
    }
  }

  return renames;
}

// None of the 2 main lists is enough: the frozen one misses recent repositories, and the other one misses some forges while being older on most of the
// others (only GitHub is really refreshed). So all repositories are kept, using for each one the most recent information
export function mergeRepositoryLists(
  jsonRepositories: JsonRepositorySchemaType[],
  ecosystemRepositories: EcosystemRepositorySchemaType[],
  lastInventoryRepositories: LastInventoryRepositorySchemaType[] = []
): JsonRepositorySchemaType[] {
  const formerRepositoriesKeys = new Set(
    findRenamedRepositories(jsonRepositories, ecosystemRepositories).map((rename) => getRepositoryKey(rename.fromUrl))
  );
  const knownRepositories = new Map(
    jsonRepositories
      .filter((repository) => !formerRepositoriesKeys.has(getRepositoryKey(repository.repository_url)))
      .map((repository) => [getRepositoryKey(repository.repository_url), repository])
  );
  const emptyRepositoriesKeys = new Set<string>();
  let invalidEcosystemRepositoriesCount = 0;
  let invalidLastInventoryRepositoriesCount = 0;

  // A record not fitting what is stored (too long description or topics, URL ending with a slash...) is skipped
  const toJsonOrNull = (...parameters: Parameters<typeof ecosystemRepositoryToJson>): JsonRepositorySchemaType | null => {
    try {
      return ecosystemRepositoryToJson(...parameters);
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof TypeError) {
        return null;
      }

      throw error;
    }
  };

  for (const repository of ecosystemRepositories) {
    const key = getRepositoryKey(repository.html_url);
    const known = knownRepositories.get(key);

    if (repository.default_branch === null) {
      emptyRepositoriesKeys.add(key); // There is nothing to analyze
    } else if (!known || repository.updated_at > known.last_update) {
      const jsonRepository = toJsonOrNull({ ...repository, default_branch: repository.default_branch }, known);

      if (jsonRepository) {
        knownRepositories.set(key, jsonRepository);
      } else {
        invalidEcosystemRepositoriesCount++;
      }
    }
  }

  assertUsableRepositoryList('ecosystem', ecosystemRepositories.length, invalidEcosystemRepositoriesCount);

  // It has less information so it's only about adding the unknown ones
  lastInventoryRepositories.forEach((repository, index) => {
    const key = getRepositoryKey(repository.id);

    if (!knownRepositories.has(key) && !emptyRepositoriesKeys.has(key) && !formerRepositoriesKeys.has(key)) {
      let jsonRepository: JsonRepositorySchemaType | null = null;

      try {
        jsonRepository = toJsonOrNull({ ...lastInventoryRepositoryToEcosystem(repository, index), default_branch: 'main' });
      } catch (error) {
        if (!(error instanceof TypeError)) {
          throw error; // An invalid owner URL is a `TypeError`
        }
      }

      if (jsonRepository) {
        knownRepositories.set(key, jsonRepository);
      } else {
        invalidLastInventoryRepositoriesCount++;
      }
    }
  });

  assertUsableRepositoryList('last inventory', lastInventoryRepositories.length, invalidLastInventoryRepositoriesCount);

  return Array.from(knownRepositories.values());
}

const minimumMonthsBetweenSheetsForNewCode = 6;

// Counters move all the time, recomputing an initiative sheet (with the LLM) is only worth it for what it talks about. A new commit
// is the only sign that the code or the README changed, but an active project would be computed again at every run without a delay
export function isMeaningfulRepositoryChange(
  before: LiteRawRepositorySchemaType,
  after: LiteRawRepositorySchemaType,
  sheetComputedAt: Date | null
): boolean {
  const hasNewCode = before.lastModification.getTime() !== after.lastModification.getTime();
  const isSheetOld = !sheetComputedAt || sheetComputedAt < subMonths(new Date(), minimumMonthsBetweenSheetsForNewCode);

  return before.name !== after.name || before.description !== after.description || before.homepage !== after.homepage || (hasNewCode && isSheetOld);
}

async function deleteRawRepository(
  tx: Prisma.TransactionClient,
  rawRepository: Pick<LiteRawRepositorySchemaType, 'platform' | 'organizationName' | 'name' | 'repositoryUrl'>
) {
  // If it was considered as a main raw domain for some others, we mark those ones to be reprocessed
  await tx.rawRepository.updateMany({
    where: {
      AND: [
        {
          platform: {
            not: rawRepository.platform,
          },
        },
        {
          organizationName: {
            not: rawRepository.organizationName,
          },
        },
        {
          name: {
            not: rawRepository.name,
          },
        },
      ],
      mainSimilarRepository: {
        is: {
          name: rawRepository.name,
        },
      },
    },
    data: {
      mainSimilarRepositoryId: null,
      updateMainSimilarRepository: true,
    },
  });

  const deletedRawRepository = await tx.rawRepository.delete({
    where: {
      repositoryUrl: rawRepository.repositoryUrl,
    },
    select: {
      RawRepositoriesOnInitiativeMaps: {
        select: {
          initiativeMapId: true,
        },
      },
    },
  });

  if (deletedRawRepository.RawRepositoriesOnInitiativeMaps) {
    await tx.initiativeMap.update({
      where: {
        id: deletedRawRepository.RawRepositoriesOnInitiativeMaps.initiativeMapId,
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

// A renamed repository would otherwise be removed and added again, and its sheet replaced by a new one at another address. So the stored
// record takes the new address when it is the one described by a sheet (the record of the new address, already added by a previous
// synchronization without having a sheet, is removed). In the other cases the former record is simply removed like any missing repository
async function renameRawRepositoriesHavingSheet(tx: Prisma.TransactionClient, renames: { fromUrl: string; toUrl: string }[]): Promise<number> {
  const sheetSelect = {
    platform: true,
    organizationName: true,
    name: true,
    repositoryUrl: true,
    RawRepositoriesOnInitiativeMaps: {
      select: {
        initiativeMapId: true,
        initiative: {
          select: {
            Initiative: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    },
  } satisfies Prisma.RawRepositorySelect;

  const renamedTargets = new Set<string>();

  for (const rename of renames) {
    watchGracefulExitInLoop();

    // A repository renamed several times can have more than one former address in the frozen list
    if (renamedTargets.has(rename.toUrl)) {
      continue;
    }

    const [formerRawRepository, newRawRepository] = await Promise.all([
      tx.rawRepository.findUnique({ where: { repositoryUrl: rename.fromUrl }, select: sheetSelect }),
      tx.rawRepository.findUnique({ where: { repositoryUrl: rename.toUrl }, select: sheetSelect }),
    ]);

    if (
      !formerRawRepository?.RawRepositoriesOnInitiativeMaps?.initiative.Initiative ||
      newRawRepository?.RawRepositoriesOnInitiativeMaps?.initiative.Initiative
    ) {
      continue;
    }

    if (newRawRepository) {
      await deleteRawRepository(tx, newRawRepository);
    }

    // The other properties are refreshed by the synchronization right after, it also marks the map to be computed again
    await tx.rawRepository.update({
      where: {
        repositoryUrl: rename.fromUrl,
      },
      data: {
        repositoryUrl: rename.toUrl,
      },
      select: {
        id: true,
      },
    });

    await tx.initiativeMap.update({
      where: {
        id: formerRawRepository.RawRepositoriesOnInitiativeMaps.initiativeMapId,
      },
      data: {
        update: true,
      },
      select: {
        id: true,
      },
    });

    renamedTargets.add(rename.toUrl);
  }

  return renamedTargets.size;
}

export async function formatRepositoriesIntoDatabase() {
  const content = await fs.readFile(localJsonPath, 'utf-8');
  const records: unknown[] = JSON.parse(content);
  const ecosystemContent = await fs.readFile(localEcosystemJsonPath, 'utf-8');
  const ecosystemRepositories = z.array(EcosystemRepositorySchema).parse(JSON.parse(ecosystemContent));
  const lastInventoryContent = await fs.readFile(localLastInventoryJsonPath, 'utf-8');
  const lastInventoryRepositories = z.array(LastInventoryRepositorySchema).parse(JSON.parse(lastInventoryContent));
  const duplicatesMarkers = new Set<string>();

  const frozenJsonRepositories = records
    .filter((record) => {
      // An empty repository has no default branch, there is nothing to analyze
      return (record as { default_branch: unknown }).default_branch !== null;
    })
    .map((record) => {
      return JsonRepositorySchema.parse(record);
    });

  const jsonRepositories = mergeRepositoryLists(frozenJsonRepositories, ecosystemRepositories, lastInventoryRepositories).filter(
    (jsonRepository: JsonRepositorySchemaType) => {
      // In development environment we reduce the dataset to analyze
      if (process.env.APP_MODE === 'dev' && !jsonRepository.repository_url.includes('https://github.com/betagouv/')) {
        return false;
      }

      // Skip forks since there is a high chance of being something not new (it's rare people forking for new projects, they should use templates instead)
      if (jsonRepository.is_fork === true) {
        return false;
      } else if (jsonRepository.is_fork === null && jsonRepository.description?.toLowerCase().includes('fork')) {
        // Repositories from forges other than GitHub do not have the fork metadata so trying to look is the developper specified it in the description
        return false;
      }

      // Keep and compare its "unique" signature to skip duplicates
      if (duplicatesMarkers.has(jsonRepository.repository_url)) {
        return false;
      } else {
        duplicatesMarkers.add(jsonRepository.repository_url);
      }

      // Note: we keep archived projects because they can still bring value years after :)
      return true;
    }
  );

  // Only a rename toward a kept repository is applied, otherwise the record would be removed right after
  const keptRepositoriesUrls = new Map(
    jsonRepositories.map((jsonRepository) => [getRepositoryKey(jsonRepository.repository_url), new URL(jsonRepository.repository_url).toString()])
  );
  const renames = findRenamedRepositories(frozenJsonRepositories, ecosystemRepositories).flatMap((rename) => {
    const toUrl = keptRepositoriesUrls.get(rename.toKey);

    return toUrl ? [{ fromUrl: new URL(rename.fromUrl).toString(), toUrl: toUrl }] : [];
  });

  await prisma.$transaction(
    async (tx) => {
      const renamedCount = await renameRawRepositoriesHavingSheet(tx, renames);

      console.log(`${renamedCount}/${renames.length} renamed repositories keep their record since having an initiative sheet`);

      const storedRawRepositories = await tx.rawRepository.findMany({
        select: {
          name: true,
          organizationName: true,
          platform: true,
          repositoryUrl: true,
          description: true,
          defaultBranch: true,
          isFork: true,
          isArchived: true,
          creationDate: true,
          lastUpdate: true,
          lastModification: true,
          homepage: true,
          starsCount: true,
          forksCount: true,
          license: true,
          openIssuesCount: true,
          language: true,
          topics: true,
          softwareHeritageExists: true,
          softwareHeritageUrl: true,
        },
      });

      // To make the diff we compare only meaningful properties
      const storedLiteRawRepositories = new Map<LiteRawRepositorySchemaType['repositoryUrl'], LiteRawRepositorySchemaType>();
      storedRawRepositories.forEach((rawRepository) => {
        storedLiteRawRepositories.set(
          rawRepository.repositoryUrl,
          LiteRawRepositorySchema.parse({
            name: rawRepository.name,
            organizationName: rawRepository.organizationName,
            platform: rawRepository.platform,
            repositoryUrl: rawRepository.repositoryUrl,
            description: rawRepository.description,
            defaultBranch: rawRepository.defaultBranch,
            isFork: rawRepository.isFork,
            isArchived: rawRepository.isArchived,
            creationDate: rawRepository.creationDate,
            lastUpdate: rawRepository.lastUpdate,
            lastModification: rawRepository.lastModification,
            homepage: rawRepository.homepage,
            starsCount: rawRepository.starsCount,
            forksCount: rawRepository.forksCount,
            license: rawRepository.license,
            openIssuesCount: rawRepository.openIssuesCount,
            language: rawRepository.language,
            topics: rawRepository.topics,
            softwareHeritageExists: rawRepository.softwareHeritageExists,
            softwareHeritageUrl: rawRepository.softwareHeritageUrl,
          })
        );
      });

      const csvLiteRepositories: typeof storedLiteRawRepositories = new Map();
      jsonRepositories.forEach((jsonRepository) => {
        const parsedRepositoryUrl = new URL(jsonRepository.repository_url); // Helps standardizing format with ending slash

        csvLiteRepositories.set(
          jsonRepository.repository_url,
          LiteRawRepositorySchema.parse({
            name: jsonRepository.name,
            organizationName: jsonRepository.organization_name,
            platform: rawRepositoryPlatformJsonToModel(jsonRepository.platform),
            repositoryUrl: parsedRepositoryUrl.toString(),
            description: jsonRepository.description,
            defaultBranch: jsonRepository.default_branch,
            isFork: jsonRepository.is_fork,
            isArchived: jsonRepository.is_archived,
            creationDate: jsonRepository.creation_date,
            lastUpdate: jsonRepository.last_update,
            lastModification: jsonRepository.last_modification,
            homepage: jsonRepository.homepage,
            starsCount: jsonRepository.stars_count,
            forksCount: jsonRepository.forks_count,
            license: jsonRepository.license,
            openIssuesCount: jsonRepository.open_issues_count,
            language: jsonRepository.language,
            topics: jsonRepository.topics,
            softwareHeritageExists: jsonRepository.software_heritage_exists,
            softwareHeritageUrl: jsonRepository.software_heritage_url,
          })
        );
      });

      const diffResult = getDiff(storedLiteRawRepositories, csvLiteRepositories);

      console.log(`synchronizing raw repositories into the database (${formatDiffResultLog(diffResult)})`);

      await tx.rawRepository.createMany({
        data: diffResult.added.map((addedLiteRawRepository) => {
          const parsedRepositoryUrl = new URL(addedLiteRawRepository.repositoryUrl);

          return {
            name: addedLiteRawRepository.name,
            organizationName: addedLiteRawRepository.organizationName,
            platform: addedLiteRawRepository.platform,
            repositoryUrl: addedLiteRawRepository.repositoryUrl,
            description: addedLiteRawRepository.description,
            defaultBranch: addedLiteRawRepository.defaultBranch,
            isFork: addedLiteRawRepository.isFork,
            isArchived: addedLiteRawRepository.isArchived,
            creationDate: addedLiteRawRepository.creationDate,
            lastUpdate: addedLiteRawRepository.lastUpdate,
            lastModification: addedLiteRawRepository.lastModification,
            homepage: addedLiteRawRepository.homepage,
            starsCount: addedLiteRawRepository.starsCount,
            forksCount: addedLiteRawRepository.forksCount,
            license: addedLiteRawRepository.license,
            openIssuesCount: addedLiteRawRepository.openIssuesCount,
            language: addedLiteRawRepository.language,
            topics: addedLiteRawRepository.topics,
            softwareHeritageExists: addedLiteRawRepository.softwareHeritageExists,
            softwareHeritageUrl: addedLiteRawRepository.softwareHeritageUrl,
            repositoryDomain: parsedRepositoryUrl.hostname,
            probableWebsiteUrl: null,
            probableWebsiteDomain: null,
            updateInferredMetadata: true,
            mainSimilarRepositoryId: null,
            updateMainSimilarRepository: true,
            lastUpdateAttemptWithReachabilityError: null,
            lastUpdateAttemptReachabilityError: null,
          };
        }),
        skipDuplicates: true,
      });

      for (const deletedLiteRawRepository of diffResult.removed) {
        watchGracefulExitInLoop();

        await deleteRawRepository(tx, deletedLiteRawRepository);
      }

      for (const updatedLiteRawRepository of diffResult.updated) {
        watchGracefulExitInLoop();

        const parsedRepositoryUrl = new URL(updatedLiteRawRepository.repositoryUrl);

        const updatedRawRepository = await tx.rawRepository.update({
          where: {
            repositoryUrl: updatedLiteRawRepository.repositoryUrl,
          },
          data: {
            name: updatedLiteRawRepository.name,
            organizationName: updatedLiteRawRepository.organizationName,
            platform: updatedLiteRawRepository.platform,
            repositoryUrl: updatedLiteRawRepository.repositoryUrl,
            description: updatedLiteRawRepository.description,
            defaultBranch: updatedLiteRawRepository.defaultBranch,
            isFork: updatedLiteRawRepository.isFork,
            isArchived: updatedLiteRawRepository.isArchived,
            creationDate: updatedLiteRawRepository.creationDate,
            lastUpdate: updatedLiteRawRepository.lastUpdate,
            lastModification: updatedLiteRawRepository.lastModification,
            homepage: updatedLiteRawRepository.homepage,
            starsCount: updatedLiteRawRepository.starsCount,
            forksCount: updatedLiteRawRepository.forksCount,
            license: updatedLiteRawRepository.license,
            openIssuesCount: updatedLiteRawRepository.openIssuesCount,
            language: updatedLiteRawRepository.language,
            topics: updatedLiteRawRepository.topics,
            softwareHeritageExists: updatedLiteRawRepository.softwareHeritageExists,
            softwareHeritageUrl: updatedLiteRawRepository.softwareHeritageUrl,
            repositoryDomain: parsedRepositoryUrl.hostname,
            lastUpdateAttemptWithReachabilityError: null,
            lastUpdateAttemptReachabilityError: null,
            // Recompute some generated values since it was based on above values
            updateInferredMetadata: true,
            updateMainSimilarRepository: true,
          },
          select: {
            RawRepositoriesOnInitiativeMaps: {
              select: {
                initiativeMapId: true,
                initiative: {
                  select: {
                    Initiative: {
                      select: {
                        computedAt: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        const storedLiteRawRepository = storedLiteRawRepositories.get(updatedLiteRawRepository.repositoryUrl);

        if (
          updatedRawRepository.RawRepositoriesOnInitiativeMaps &&
          (!storedLiteRawRepository ||
            isMeaningfulRepositoryChange(
              storedLiteRawRepository,
              updatedLiteRawRepository,
              updatedRawRepository.RawRepositoriesOnInitiativeMaps.initiative.Initiative?.computedAt ?? null
            ))
        ) {
          await tx.initiativeMap.update({
            where: {
              id: updatedRawRepository.RawRepositoriesOnInitiativeMaps.initiativeMapId,
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

export async function updateInferredMetadataOnRepositories() {
  const rawRepositories = await prisma.rawRepository.findMany({
    where: {
      updateInferredMetadata: true,
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
      platform: true,
      organizationName: true,
      name: true,
      description: true,
      repositoryUrl: true,
      homepage: true,
    },
  });

  for (const [rawRepositoryIndex, rawRepository] of Object.entries(rawRepositories)) {
    watchGracefulExitInLoop();

    console.log(
      `try to locally infer metadata for repository ${rawRepository.repositoryUrl} (${rawRepository.id}) ${formatArrayProgress(
        rawRepositoryIndex,
        rawRepositories.length
      )}`
    );

    // If there is a declared URL, take it as it comes
    let probableWebsiteUrl: URL | null = null;
    try {
      if (rawRepository.homepage) {
        probableWebsiteUrl = new URL(rawRepository.homepage);
      }
    } catch (error) {
      // Silent :)
    }

    if (!probableWebsiteUrl && rawRepository.description) {
      // Try to find a link into the description, and skip if more than one because maybe it targets different things
      const matches = (linkify.match(rawRepository.description) || []).filter((match) => {
        try {
          const parsedUrl = new URL(match.url);

          return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
        } catch (error) {
          return false;
        }
      });

      if (matches.length === 1) {
        probableWebsiteUrl = new URL(matches[0].url);

        // The link parser may return links with `http:` but it's unlikely they work like that in 2023+, so forcing to HTTPS
        probableWebsiteUrl.protocol = 'https:';
      }
    }

    await prisma.rawRepository.update({
      where: {
        id: rawRepository.id,
      },
      data: {
        probableWebsiteUrl: probableWebsiteUrl ? probableWebsiteUrl.toString() : null,
        probableWebsiteDomain: probableWebsiteUrl ? probableWebsiteUrl.hostname : null,
        updateInferredMetadata: false,
        lastUpdateAttemptWithReachabilityError: null,
        lastUpdateAttemptReachabilityError: null,
      },
      select: {
        id: true, // Ref: https://github.com/prisma/prisma/issues/6252
      },
    });
  }
}

const multirepositoriesPatterns = [
  // Due to complicated regexes below (I didn't figure it a better way of doing)
  // we have to specify longer string like "application" before "app" otherwise it strips despite using delimiter into regex... I'm sorry the syntax is too complicated
  'application',
  'app',
  'dashboard',
  'site',
  'web',
  'www',
  'landing',
  'mobile',
  'api',
  'frontend',
  'front',
  'ui',
  'blog',
  'backend',
  'backoffice',
  'back',
  'admin',
  'core',
  'docs',
  'doc',
  'tools',
  'utils',
  'scripts',
  'cli',
  'lib',
  'client',
  'sdk',
  'infra',
  'config',
  'charts',
  'docker',
  'test',
];

export function stripMultirepositoriesPatterns(name: string): string {
  // Note: I didn't succeed to make it with 2 regex... even with GPT help :D
  // Note: it remove versions in addition to common words, those written `v6` or `v247`
  const patternsRegex = new RegExp(`((?<=^)|(?<=[/\\-_\.]))(${multirepositoriesPatterns.join('|')}|v\\\d+)((?<=$)|(?<![/\\-_\.]))`, 'g');

  return (
    name
      // Remove common words
      .replace(patternsRegex, '')
      // Clean remaining double delimiters
      .replace(/(?<=[-_\.])([-_\.])/g, '')
      // Remove them in case at start, end, or next to a slash
      .replace(/(?<=^|\/)[-_\.]/g, '')
      .replace(/[-_\.](?<=$|\/)/g, '')
  );
}

export function getRepositoryNameWithSubgroups(repositoryUrl: string): string {
  // Since is mainly due to the provided repository from the CSV does not include subgroups so we have to retrieve them from the full URL
  // Note: at start we removed the organization name from the pathname... but it appears the CSV gives sometimes wrong organization like (`ikats` as organization whereas the full URL is `https://gricad-gitlab.univ-grenoble-alpes.fr/marinesj/ls_translator`)
  // so we consider stripping the first piece of the pathname (hopping it won't do weird things for the matching)
  const url = new URL(repositoryUrl);
  const fullName = url.pathname;

  const parts = fullName.split('/');
  parts.shift(); // this is for the leading pathname "/" that produces an empty string
  parts.shift(); // this is for the organization name

  return parts.join('/');
}

export function hasProbableGenericDomain(rawRepository: Pick<RawRepository, 'probableWebsiteDomain' | 'probableWebsiteUrl'>): boolean {
  if (
    ['github.com', 'gitlab.com', 'bitbucket.org', 'npmjs.com', 'www.npmjs.com', 'pypi.org'].includes(rawRepository.probableWebsiteDomain || '') ||
    // Some publish their website on a specific shared with many other projects of their organization (some excluding this case and relying on URLs instead)
    rawRepository.probableWebsiteDomain?.endsWith('.github.io') ||
    rawRepository.probableWebsiteDomain?.endsWith('.gitbooks.io') ||
    rawRepository.probableWebsiteDomain?.endsWith('.gitlab.io') ||
    rawRepository.probableWebsiteUrl?.startsWith('https://pages.gitlab.io/') ||
    rawRepository.probableWebsiteUrl?.startsWith('https://hub.docker.com/') ||
    rawRepository.probableWebsiteUrl?.startsWith('https://dockerhub.com/') ||
    // Some beta.gouv.fr projects target their own product sheet instead of their product (this workaround should be removed once Établi is adopted so they adjust their description)
    rawRepository.probableWebsiteUrl?.startsWith('https://beta.gouv.fr/startup/') ||
    rawRepository.probableWebsiteUrl?.startsWith('https://beta.gouv.fr/startups/') ||
    // Some projects put their project publication on a dedicated platform
    rawRepository.probableWebsiteUrl?.startsWith('https://hal.science/hal-') ||
    rawRepository.probableWebsiteUrl?.startsWith('https://inria.hal.science/hal-') ||
    rawRepository.probableWebsiteUrl?.startsWith('https://hal.inria.fr/hal-') ||
    rawRepository.probableWebsiteUrl?.startsWith('https://hal.archives-ouvertes.fr/hal-') ||
    rawRepository.probableWebsiteUrl?.startsWith('https://arxiv.org/abs/') ||
    rawRepository.probableWebsiteUrl?.startsWith('https://arxiv.org/pdf/')
  ) {
    return true;
  } else {
    return false;
  }
}

export async function matchRepositories() {
  const rawRepositoriesToUpdate = await prisma.rawRepository.findMany({
    where: {
      updateMainSimilarRepository: true,
    },
    select: {
      id: true,
      platform: true,
      organizationName: true,
      name: true,
      repositoryUrl: true,
      probableWebsiteDomain: true,
      probableWebsiteUrl: true,
    },
  });

  for (const [rawRepositoryToUpdateIndex, rawRepositoryToUpdate] of Object.entries(rawRepositoriesToUpdate)) {
    watchGracefulExitInLoop();

    console.log(
      `try to bind similar repositories to repository ${rawRepositoryToUpdate.repositoryUrl} (${rawRepositoryToUpdate.id}) ${formatArrayProgress(
        rawRepositoryToUpdateIndex,
        rawRepositoriesToUpdate.length
      )}`
    );

    // The repositories to look for should be under the same platform and organization (unlikely people would set code for the same application at multiple locations)
    const otherOrganizationRepositories = await prisma.rawRepository.findMany({
      where: {
        // Note: we switched to not exclude the current repository to have the top item for all similar ones
        platform: rawRepositoryToUpdate.platform,
        organizationName: rawRepositoryToUpdate.organizationName,
      },
      select: {
        id: true,
        organizationName: true,
        name: true,
        repositoryUrl: true,
      },
      orderBy: [
        // If there is a matching we try to consider the main one based on naming pattern (root name would be the main one since other pattern is hard to say it has more value than others),
        // but if those criterias don't apply we consider the one with the more stars, consider alphabetical order too
        {
          starsCount: 'desc',
        },
        {
          name: 'asc',
        },
      ],
    });

    const rawRepositoryNameWithGroups = getRepositoryNameWithSubgroups(rawRepositoryToUpdate.repositoryUrl);
    const strippedNameToLookFor = stripMultirepositoriesPatterns(rawRepositoryNameWithGroups);
    const isRepositoryMainOneFromStrippedName = rawRepositoryNameWithGroups !== strippedNameToLookFor;

    // Only keep repositories having the exact same stripped name
    const sameRepositories = otherOrganizationRepositories.filter((repository) => {
      const repositoryNameWithGroups = getRepositoryNameWithSubgroups(repository.repositoryUrl);

      return stripMultirepositoriesPatterns(repositoryNameWithGroups) === strippedNameToLookFor;
    });

    // Only look for main repository through naming if the current one is not equal "to our root name"
    let mainReposistoryFromStrippedName: (typeof otherOrganizationRepositories)[0] | null = null;
    if (isRepositoryMainOneFromStrippedName) {
      // If any of them has the stripped name equivalent to the name, we can consider as main one since no additional word
      mainReposistoryFromStrippedName =
        sameRepositories.find((repository) => {
          const repositoryNameWithGroups = getRepositoryNameWithSubgroups(repository.repositoryUrl);

          return repositoryNameWithGroups === strippedNameToLookFor;
        }) || null;

      // Otherwise take the first of the list
      if (!mainReposistoryFromStrippedName && sameRepositories.length > 0) {
        mainReposistoryFromStrippedName = sameRepositories[0];
      }
    }

    if (rawRepositoryToUpdate.id === mainReposistoryFromStrippedName?.id) {
      // See `where` condition to understand the logic moved
      mainReposistoryFromStrippedName = null;
    }

    // And have a look to repository probably targeting the same domain or exact same URL
    // Note: at start we wanted to look for same probable domains but since websites may be hosted by same websites we added an hardcoded condition
    let hasGenericDomain = false;
    if (hasProbableGenericDomain(rawRepositoryToUpdate)) {
      hasGenericDomain = true;
    }

    let mainRepositoryFromProbableDomainName: (typeof otherOrganizationRepositories)[0] | null = null;

    // If there is no website information to look from, skip
    if (!!rawRepositoryToUpdate.probableWebsiteDomain && !!rawRepositoryToUpdate.probableWebsiteUrl) {
      mainRepositoryFromProbableDomainName = await prisma.rawRepository.findFirst({
        where: {
          // Note: we switched to not exclude the current repository to have the top item for all similar ones
          // Also, to not break ordering when looking at same domain we do not exclude those from considered as equivalent from `sameRepositories`
          probableWebsiteDomain: !hasGenericDomain ? rawRepositoryToUpdate.probableWebsiteDomain : undefined,
          probableWebsiteUrl: hasGenericDomain ? rawRepositoryToUpdate.probableWebsiteUrl : undefined,
        },
        select: {
          id: true,
          organizationName: true,
          name: true,
          repositoryUrl: true,
        },
        orderBy: [
          // Keep always the same order so for next occurences they would be linked to the same
          {
            starsCount: 'desc',
          },
          {
            name: 'asc',
          },
        ],
      });

      if (
        rawRepositoryToUpdate.id === mainRepositoryFromProbableDomainName?.id || // See `where` condition to understand the logic moved
        sameRepositories.map((sameRepository) => sameRepository.id).includes(mainRepositoryFromProbableDomainName?.id || '') // If it was considered as linked during the naming pattern matching, exclude it to not break the tree direction
      ) {
        mainRepositoryFromProbableDomainName = null;
      }
    }

    const similarRawRepository = mainReposistoryFromStrippedName || mainRepositoryFromProbableDomainName;

    await prisma.rawRepository.update({
      where: {
        id: rawRepositoryToUpdate.id,
      },
      data: {
        mainSimilarRepository: {
          connect: similarRawRepository
            ? {
                id: similarRawRepository.id,
              }
            : undefined,
          disconnect: !similarRawRepository ? true : undefined,
        },
        updateMainSimilarRepository: false,
      },
      select: {
        id: true, // Ref: https://github.com/prisma/prisma/issues/6252
      },
    });
  }
}

export async function enhanceRepositoriesIntoDatabase() {
  // We do not parallelize with `Promise.all` to have
  // logs readable to not flood the network and be consider as a bad actor
  await updateInferredMetadataOnRepositories();
  await matchRepositories();
}

// Most schools host their forge, where students push a few repositories for a given year and never touch them again. They stay in
// the list of repositories but are not initiatives. No group pattern allows detecting them since each promotion has its own, so
// this is a guess from the behavior: some small lab or association projects are also caught, which is acceptable for an annual project
export const schoolForgePattern = /^https?:\/\/[^/]*(univ|iut|polytech|enseeiht|utc\.fr|insa|cnam|centralesupelec|ensta|ens-)/;
export const maximumStudentRepositoryLifetimeInDays = 365;

export function isLikelyStudentRepository(
  rawRepository: Pick<RawRepository, 'repositoryUrl' | 'starsCount' | 'forksCount' | 'homepage' | 'creationDate' | 'lastModification'>
): boolean {
  return (
    schoolForgePattern.test(rawRepository.repositoryUrl) &&
    rawRepository.starsCount === 0 &&
    rawRepository.forksCount === 0 &&
    !rawRepository.homepage &&
    differenceInDays(rawRepository.lastModification, rawRepository.creationDate) <= maximumStudentRepositoryLifetimeInDays
  );
}
