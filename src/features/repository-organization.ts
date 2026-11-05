import { minutesToMilliseconds } from 'date-fns/minutesToMilliseconds';
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { parse as parseYaml } from 'yaml';
import z from 'zod';

import { downloadFile } from '@etabli/src/common';
import { normalizeRepositoryOrganizationUrl } from '@etabli/src/features/organization-matching';
import { Prisma } from '@etabli/src/generated/prisma/client';
import { LiteRepositoryOrganizationSchema, LiteRepositoryOrganizationSchemaType } from '@etabli/src/models/entities/organization';
import { prisma } from '@etabli/src/prisma';
import { watchGracefulExitInLoop } from '@etabli/src/server/system';
import { formatDiffResultLog, getDiff } from '@etabli/src/utils/comparaison';

const __root_dirname = process.cwd();

// This file lists forges and forge accounts of public organizations, each with its identifier into the DILA directory (`pso_id`)
// Ref: https://code.gouv.fr/sources/
export const latestRemoteYamlUrl = 'https://code.gouv.fr/data/comptes-organismes-publics.yml';
export const localYamlPath = path.resolve(__root_dirname, './data/codegouv-repository-organizations.yaml');

// Some entries use this placeholder when the organization is unknown
const unknownDilaId = '00000000-0000-0000-0000-000000000000';

const DilaIdSchema = z
  .string()
  .uuid()
  .nullish()
  .transform((value) => (!value || value === unknownDilaId ? null : value));

export const YamlRepositoryOrganizationsSchema = z.record(
  z.string().min(1), // The forge hostname
  z
    .object({
      pso_id: DilaIdSchema,
      owners: z
        .record(
          z.coerce.string().min(1), // The account (or GitLab group path), some are only digits so the YAML parser gives a number
          z
            .object({
              pso_id: DilaIdSchema,
            })
            .nullish()
        )
        .nullish(),
    })
    .nullish()
);
export type YamlRepositoryOrganizationsSchemaType = z.infer<typeof YamlRepositoryOrganizationsSchema>;

export async function saveRepositoryOrganizationListFile(cache = true) {
  if (!cache || !fsSync.existsSync(localYamlPath)) {
    await downloadFile(latestRemoteYamlUrl, localYamlPath);
  }
}

export function parseRepositoryOrganizations(
  yamlContent: string
): Map<LiteRepositoryOrganizationSchemaType['url'], LiteRepositoryOrganizationSchemaType> {
  // The file is maintained by hand and contains a few duplicated keys, we let the last one win instead of failing
  const forges = YamlRepositoryOrganizationsSchema.parse(parseYaml(yamlContent, { uniqueKeys: false }));

  const liteRepositoryOrganizations = new Map<LiteRepositoryOrganizationSchemaType['url'], LiteRepositoryOrganizationSchemaType>();
  const register = (url: string, dilaId: string | null) => {
    // Without the organization identifier the entry brings nothing to bind initiatives
    if (!dilaId) {
      return;
    }

    const normalizedUrl = normalizeRepositoryOrganizationUrl(url);

    liteRepositoryOrganizations.set(
      normalizedUrl,
      LiteRepositoryOrganizationSchema.parse({
        url: normalizedUrl,
        dilaId: dilaId,
      })
    );
  };

  for (const [forgeHostname, forge] of Object.entries(forges)) {
    if (!forge) {
      continue;
    }

    // A forge can be entirely dedicated to an organization
    register(`https://${forgeHostname}`, forge.pso_id);

    for (const [owner, ownerMetadata] of Object.entries(forge.owners || {})) {
      register(`https://${forgeHostname}/${owner}`, ownerMetadata?.pso_id || null);
    }
  }

  return liteRepositoryOrganizations;
}

export async function formatRepositoryOrganizationsIntoDatabase() {
  const content = await fs.readFile(localYamlPath, 'utf-8');
  const yamlLiteRepositoryOrganizations = parseRepositoryOrganizations(content);

  await prisma.$transaction(
    async (tx) => {
      const storedRepositoryOrganizations = await tx.repositoryOrganization.findMany({
        select: {
          url: true,
          dilaId: true,
        },
      });

      // To make the diff we compare only meaningful properties
      const storedLiteRepositoryOrganizations: typeof yamlLiteRepositoryOrganizations = new Map();
      for (const repositoryOrganization of storedRepositoryOrganizations) {
        storedLiteRepositoryOrganizations.set(repositoryOrganization.url, LiteRepositoryOrganizationSchema.parse(repositoryOrganization));
      }

      const diffResult = getDiff(storedLiteRepositoryOrganizations, yamlLiteRepositoryOrganizations);

      console.log(`synchronizing repository organizations into the database (${formatDiffResultLog(diffResult)})`);

      await tx.repositoryOrganization.deleteMany({
        where: {
          url: {
            in: diffResult.removed.map((removedLiteRepositoryOrganization) => removedLiteRepositoryOrganization.url),
          },
        },
      });

      await tx.repositoryOrganization.createMany({
        data: diffResult.added.map((addedLiteRepositoryOrganization) => ({
          url: addedLiteRepositoryOrganization.url,
          dilaId: addedLiteRepositoryOrganization.dilaId,
        })),
        skipDuplicates: true,
      });

      for (const updatedLiteRepositoryOrganization of diffResult.updated) {
        watchGracefulExitInLoop();

        await tx.repositoryOrganization.update({
          where: {
            url: updatedLiteRepositoryOrganization.url,
          },
          data: {
            dilaId: updatedLiteRepositoryOrganization.dilaId,
          },
          select: {
            id: true, // Ref: https://github.com/prisma/prisma/issues/6252
          },
        });
      }
    },
    {
      timeout: minutesToMilliseconds(process.env.NODE_ENV !== 'production' ? 20 : 5), // Since dealing with a lot of data, prevent closing whereas everything is alright
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    }
  );
}
