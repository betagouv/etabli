import { Prisma } from '@prisma/client';
import { parse } from 'csv-parse';
import { minutesToMilliseconds } from 'date-fns/minutesToMilliseconds';
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import z from 'zod';

import { downloadFile } from '@etabli/src/common';
import { LiteToolSchema, LiteToolSchemaType, ToolCategorySchema } from '@etabli/src/models/entities/tool';
import { toolTypeCsvToModel } from '@etabli/src/models/mappers/tool';
import { prisma } from '@etabli/src/prisma';
import { watchGracefulExitInLoop } from '@etabli/src/server/system';
import { getListDiff } from '@etabli/src/utils/comparaison';
import { emptyStringtoNullPreprocessor } from '@etabli/src/utils/validation';

const __root_dirname = process.cwd();

export const latestRemoteCsvUrl = 'https://raw.githubusercontent.com/captn3m0/stackshare-dataset/main/tools.csv';
export const localCsvPath = path.resolve(__root_dirname, './data/tools.csv');

export const CsvToolCategorySchema = z.enum([
  'languages-and-frameworks',
  'build-test-deploy',
  'libraries',
  'data-stores',
  'collaboration',
  'back-office',
  'analytics',
  'application-hosting',
  'application-utilities',
  'assets-and-media',
  'support-sales-and-marketing',
  'design',
  'monitoring',
  'payments',
  'communications',
  'mobile',
]);
export type CsvToolCategorySchemaType = z.infer<typeof CsvToolCategorySchema>;

export const CsvToolSchema = z
  .object({
    url: z.string().url(),
    object_id: z.string(),
    name: z.string().min(1),
    title: emptyStringtoNullPreprocessor(z.string().min(1).nullable()),
    popularity: z.coerce.number(),
    votes: z.coerce.number().nonnegative(),
    verified: z.coerce.boolean(),
    description: emptyStringtoNullPreprocessor(z.string().min(1).nullable()),
    stack_count: z.coerce.number().nonnegative(),
    type: z.literal('service'),
    category: CsvToolCategorySchema,
    layer: z.string().min(1),
    function: z.string().min(1),
  })
  .strict();
export type CsvToolSchemaType = z.infer<typeof CsvToolSchema>;

export async function saveToolCsvFile(cache = true) {
  if (!cache || !fsSync.existsSync(localCsvPath)) {
    await downloadFile(latestRemoteCsvUrl, localCsvPath);
  }
}

export async function formatToolsIntoDatabase() {
  const parser = fsSync.createReadStream(localCsvPath, 'utf-8').pipe(
    parse({
      columns: true, // Each record as object instead of array
      delimiter: ',',
      cast: false, // Disable otherwise projects with names being a number will complicate things
      cast_date: false, // Disable otherwise it tries to transform `name` and `url` to dates
      skip_empty_lines: true,
    })
  );

  const csvTools: CsvToolSchemaType[] = [];
  for await (const record of parser) {
    const csvTool = CsvToolSchema.parse(record);

    // Since the tool list will be used by GPT to infer tools of initiatives
    // we skip those not widely used to not add noise during the matching to get better results
    if (csvTool.stack_count < 10) {
      continue;
    }

    csvTools.push(csvTool);
  }

  await prisma.$transaction(
    async (tx) => {
      const storedTools = await tx.tool.findMany({
        select: {
          name: true,
          title: true,
          description: true,
          category: true,
        },
      });

      // To make the diff we compare only meaningful properties
      const storedLiteTools = storedTools.map((tool) =>
        LiteToolSchema.parse({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          category: tool.category,
        })
      );
      const csvLiteTools = csvTools.map((csvTool) =>
        LiteToolSchema.parse({
          name: csvTool.name,
          title: csvTool.title,
          description: csvTool.description,
          category: toolTypeCsvToModel(csvTool.category),
        })
      );

      // We add a few extra tools that are common to public french initiatives (but not enough to be listed on StackShare)
      csvLiteTools.push(
        LiteToolSchema.parse({
          name: 'DSFR',
          title: "Official french government's design system (Système de Design de l'État)",
          description: `Le Système de Design de l'État (ci-après, le DSFR) est un ensemble de composants web HTML, CSS et Javascript pour faciliter le travail des équipes projets des sites Internet publics, et créer des interfaces numériques de qualité et accessibles.`,
          category: ToolCategorySchema.Values.LANGUAGES_AND_FRAMEWORKS,
        })
      );

      const diffResult = getListDiff(storedLiteTools, csvLiteTools, {
        referenceProperty: 'name',
      });

      let anyChange = false;
      for (const diffItem of diffResult.diff) {
        watchGracefulExitInLoop();

        if (diffItem.status === 'added') {
          const liteTool = diffItem.value as LiteToolSchemaType;
          anyChange = true;

          await tx.tool.create({
            data: {
              name: liteTool.name,
              title: liteTool.title,
              description: liteTool.description,
              category: liteTool.category,
            },
            select: {
              id: true, // Ref: https://github.com/prisma/prisma/issues/6252
            },
          });
        } else if (diffItem.status === 'deleted') {
          const liteTool = diffItem.value as LiteToolSchemaType;
          anyChange = true;

          const deletedTool = await tx.tool.delete({
            where: {
              name: liteTool.name,
            },
            select: {
              id: true, // Ref: https://github.com/prisma/prisma/issues/6252
            },
          });
        } else if (diffItem.status === 'updated') {
          const liteTool = diffItem.value as LiteToolSchemaType;
          anyChange = true;

          const updatedTool = await tx.tool.update({
            where: {
              name: liteTool.name,
            },
            data: {
              name: liteTool.name,
              title: liteTool.title,
              description: liteTool.description,
              category: liteTool.category,
            },
            select: {
              id: true, // Ref: https://github.com/prisma/prisma/issues/6252
            },
          });
        }
      }

      if (anyChange) {
        // There is a modification so on the next job we should tell the LLM system about new updates
        await prisma.settings.update({
          where: {
            onlyTrueAsId: true,
          },
          data: {
            updateIngestedTools: true,
          },
        });
      }
    },
    {
      timeout: minutesToMilliseconds(process.env.NODE_ENV !== 'production' ? 10 : 2), // Since dealing with a lot of data, prevent closing whereas everything is alright
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    }
  );
}

export async function enhanceToolsIntoDatabase() {
  // For now we do not enhance tools but we could imagine translating english data (name, title, description) into french
}
