import { getListDiff } from '@donedeal0/superdiff';
import { Prisma } from '@prisma/client';
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import z from 'zod';

import { downloadFile } from '@etabli/common';
import { LiteRawRepositorySchema, LiteRawRepositorySchemaType } from '@etabli/models/entities/raw-repository';
import { prisma } from '@etabli/prisma';

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

          await tx.rawRepository.create({
            data: {
              name: liteRawRepository.name,
              organizationName: liteRawRepository.organizationName,
              platform: liteRawRepository.platform,
              repositoryUrl: liteRawRepository.repositoryUrl,
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
              repositoryUrl: liteRawRepository.repositoryUrl,
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

export async function enhanceRepositoriesIntoDatabase() {
  // TODO: ...
}
