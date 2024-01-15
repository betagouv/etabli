import { getListDiff } from '@donedeal0/superdiff';
import { Prisma } from '@prisma/client';
import fsSync from 'fs';
import fs from 'fs/promises';
import linkifyit from 'linkify-it';
import path from 'path';
import z from 'zod';

import { downloadFile } from '@etabli/common';
import { LiteRawRepositorySchema, LiteRawRepositorySchemaType } from '@etabli/models/entities/raw-repository';
import { prisma } from '@etabli/prisma';
import { sleep } from '@etabli/utils/sleep';

const linkify = linkifyit();

// We did not used the CSV format even if less heavy to avoid extra parsing for numbers, null, string on multiple lines... (ref: https://code.gouv.fr/data/repositories/csv/all.csv)

export const latestRemoteJsonUrl = 'https://code.gouv.fr/data/repositories/json/all.json';
export const localJsonPath = path.resolve(__dirname, '../../data/repositories.json');

export function emptyStringtoNullPreprocessor(initialValidation: z.ZodNullable<z.ZodString>) {
  return z.preprocess((value) => {
    if (value === '') {
      return null;
    }

    return value;
  }, initialValidation);
}

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

export async function saveRepositoryListFile(cache = true) {
  if (!cache || !fsSync.existsSync(localJsonPath)) {
    await downloadFile(latestRemoteJsonUrl, localJsonPath);
  }
}

export async function formatRepositoriesIntoDatabase() {
  const content = await fs.readFile(localJsonPath, 'utf-8');
  const records: unknown[] = JSON.parse(content);

  const jsonRepositories = records
    .map((record) => {
      return JsonRepositorySchema.parse(record);
    })
    .filter((jsonRepository: JsonRepositorySchemaType) => {
      // TODO: to remove due to tests on a small subset
      if (!jsonRepository.repository_url.includes('https://github.com/betagouv/')) {
        return false;
      }

      // Skip forks since there is a high chance of being something not new (it's rare people forking for new projects, they should use templates instead)
      if (jsonRepository.is_fork === true) {
        return false;
      } else if (jsonRepository.is_fork === null && jsonRepository.description?.toLowerCase().includes('fork')) {
        // Repositories from forges other than GitHub do not have the fork metadata so trying to look is the developper specified it in the description
        return false;
      }

      // Note: we keep archived projects because they can still bring value years after :)
      return true;
    });

  await prisma.$transaction(
    async (tx) => {
      const storedRawRepositories = await tx.rawRepository.findMany({
        include: {
          RawRepositoriesOnInitiativeMaps: true,
        },
      });

      // To make the diff we compare only meaningful properties
      const storedLiteRawRepositories = storedRawRepositories.map((rawRepository) =>
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
          softwareHeritageUurl: rawRepository.softwareHeritageUrl,
        })
      );
      const csvLiteRepositories = jsonRepositories.map((jsonRepository) =>
        LiteRawRepositorySchema.parse({
          name: jsonRepository.name,
          organizationName: jsonRepository.organization_name,
          platform: jsonRepository.platform,
          repositoryUrl: jsonRepository.repository_url,
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
          softwareHeritageUurl: jsonRepository.software_heritage_url,
        })
      );

      const diffResult = getListDiff(storedLiteRawRepositories, csvLiteRepositories);

      for (const diffItem of diffResult.diff) {
        if (diffItem.status === 'added') {
          const liteRawRepository = diffItem.value as LiteRawRepositorySchemaType;

          const parsedRepositoryUrl = new URL(liteRawRepository.repositoryUrl); // Helps standardizing format with ending slash

          await tx.rawRepository.create({
            data: {
              name: liteRawRepository.name,
              organizationName: liteRawRepository.organizationName,
              platform: liteRawRepository.platform,
              repositoryUrl: parsedRepositoryUrl.toString(),
              description: liteRawRepository.description,
              defaultBranch: liteRawRepository.defaultBranch,
              isFork: liteRawRepository.isFork,
              isArchived: liteRawRepository.isArchived,
              creationDate: liteRawRepository.creationDate,
              lastUpdate: liteRawRepository.lastUpdate,
              lastModification: liteRawRepository.lastModification,
              homepage: liteRawRepository.homepage,
              starsCount: liteRawRepository.starsCount,
              forksCount: liteRawRepository.forksCount,
              license: liteRawRepository.license,
              openIssuesCount: liteRawRepository.openIssuesCount,
              language: liteRawRepository.language,
              topics: liteRawRepository.topics,
              softwareHeritageExists: liteRawRepository.softwareHeritageExists,
              softwareHeritageUrl: liteRawRepository.softwareHeritageUrl,
              repositoryDomain: parsedRepositoryUrl.hostname,
              probableWebsiteUrl: null,
              probableWebsiteDomain: null,
              updateInferredMetadata: true,
              mainSimilarRepositoryId: null,
              updateMainSimilarRepository: true,
            },
          });
        } else if (diffItem.status === 'deleted') {
          const liteRawRepository = diffItem.value as LiteRawRepositorySchemaType;

          // If it was considered as a main raw domain for some others, we mark those ones to be reprocessed
          await tx.rawRepository.updateMany({
            where: {
              AND: [
                {
                  platform: {
                    not: liteRawRepository.platform,
                  },
                },
                {
                  organizationName: {
                    not: liteRawRepository.organizationName,
                  },
                },
                {
                  name: {
                    not: liteRawRepository.name,
                  },
                },
              ],
              mainSimilarRepository: {
                is: {
                  name: liteRawRepository.name,
                },
              },
            },
            data: {
              mainSimilarRepositoryId: null,
              updateMainSimilarRepository: true,
            },
          });

          const deletedRawDomain = await tx.rawRepository.delete({
            where: {
              platform_organizationName_name: {
                platform: liteRawRepository.platform,
                organizationName: liteRawRepository.organizationName,
                name: liteRawRepository.name,
              },
            },
            include: {
              RawRepositoriesOnInitiativeMaps: true,
            },
          });

          if (deletedRawDomain.RawRepositoriesOnInitiativeMaps) {
            await tx.initiativeMap.update({
              where: {
                id: deletedRawDomain.RawRepositoriesOnInitiativeMaps.initiativeMapId,
              },
              data: {
                update: true,
              },
            });
          }
        } else if (diffItem.status === 'updated') {
          const liteRawRepository = diffItem.value as LiteRawRepositorySchemaType;

          const parsedRepositoryUrl = new URL(liteRawRepository.repositoryUrl); // Helps standardizing format with ending slash

          const updatedRawRepository = await tx.rawRepository.update({
            where: {
              platform_organizationName_name: {
                platform: liteRawRepository.platform,
                organizationName: liteRawRepository.organizationName,
                name: liteRawRepository.name,
              },
            },
            data: {
              name: liteRawRepository.name,
              organizationName: liteRawRepository.organizationName,
              platform: liteRawRepository.platform,
              repositoryUrl: parsedRepositoryUrl.toString(),
              description: liteRawRepository.description,
              defaultBranch: liteRawRepository.defaultBranch,
              isFork: liteRawRepository.isFork,
              isArchived: liteRawRepository.isArchived,
              creationDate: liteRawRepository.creationDate,
              lastUpdate: liteRawRepository.lastUpdate,
              lastModification: liteRawRepository.lastModification,
              homepage: liteRawRepository.homepage,
              starsCount: liteRawRepository.starsCount,
              forksCount: liteRawRepository.forksCount,
              license: liteRawRepository.license,
              openIssuesCount: liteRawRepository.openIssuesCount,
              language: liteRawRepository.language,
              topics: liteRawRepository.topics,
              softwareHeritageExists: liteRawRepository.softwareHeritageExists,
              softwareHeritageUrl: liteRawRepository.softwareHeritageUrl,
              repositoryDomain: parsedRepositoryUrl.hostname,
              // Recompute some generated values since it was based on above values
              updateInferredMetadata: true,
              updateMainSimilarRepository: true,
            },
            include: {
              RawRepositoriesOnInitiativeMaps: true,
            },
          });

          if (updatedRawRepository.RawRepositoriesOnInitiativeMaps) {
            await tx.initiativeMap.update({
              where: {
                id: updatedRawRepository.RawRepositoriesOnInitiativeMaps.initiativeMapId,
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

export async function updateInferredMetadataOnRepositories() {
  const rawRepositories = await prisma.rawRepository.findMany({
    where: {
      updateInferredMetadata: true,
    },
    include: {
      RawRepositoriesOnInitiativeMaps: true,
    },
  });

  for (const rawRepository of rawRepositories) {
    console.log(
      `try to locally infer metadata for repository {${rawRepository.platform}} ${rawRepository.organizationName}/${rawRepository.name} (${rawRepository.id})`
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
      },
    });

    // Do not flood network
    await sleep(1000);
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

export async function matchRepositories() {
  const rawRepositoriesToUpdate = await prisma.rawRepository.findMany({
    where: {
      updateMainSimilarRepository: true,
    },
  });

  for (const rawRepositoryToUpdate of rawRepositoriesToUpdate) {
    console.log(
      `try to bind similar repositories to repository {${rawRepositoryToUpdate.platform}} ${rawRepositoryToUpdate.organizationName}/${rawRepositoryToUpdate.name} (${rawRepositoryToUpdate.id})`
    );

    // The repositories to look for should be under the same platform and organization (unlikely people would set code for the same application at multiple locations)
    const otherOrganizationRepositories = await prisma.rawRepository.findMany({
      where: {
        platform: rawRepositoryToUpdate.platform,
        organizationName: rawRepositoryToUpdate.organizationName,
        id: {
          not: rawRepositoryToUpdate.id,
        },
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

    const strippedNameToLookFor = stripMultirepositoriesPatterns(rawRepositoryToUpdate.name);

    // Only keep repositories having the exact same stripped name
    const sameRepositories = otherOrganizationRepositories.filter((repository) => {
      return stripMultirepositoriesPatterns(repository.name) === strippedNameToLookFor;
    });

    // If any of them has the stripped name equivalent to the name, we can consider as main one since no additional word
    let mainReposistoryFromStrippedName = sameRepositories.find((repository) => {
      return repository.name === strippedNameToLookFor;
    });

    // Otherwise take the first of the list
    if (!mainReposistoryFromStrippedName && sameRepositories.length > 0) {
      mainReposistoryFromStrippedName = sameRepositories[0];
    }

    const mainRepositoryFromProbableDomainName = await prisma.rawRepository.findFirst({
      where: {
        id: {
          not: rawRepositoryToUpdate.id,
        },
        probableWebsiteDomain: rawRepositoryToUpdate.probableWebsiteDomain,
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
    });
  }
}

export async function enhanceRepositoriesIntoDatabase() {
  // We do not parallelize with `Promise.all` to have
  // logs readable to not flood the network and be consider as a bad actor
  await updateInferredMetadataOnRepositories();
  await matchRepositories();
}
