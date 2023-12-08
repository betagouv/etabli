import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import z from 'zod';

import { downloadFile } from '@etabli/common';

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

  // TODO: DEBUG FOR NOW
  console.log(jsonRepositories.length);
}
