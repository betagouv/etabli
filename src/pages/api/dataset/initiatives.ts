import contentDisposition from 'content-disposition';
import { differenceInDays } from 'date-fns/differenceInDays';
import fsSync from 'fs';
import fs from 'fs/promises';
import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import { z } from 'zod';

import { getServerTranslation } from '@etabli/src/i18n';
import { FunctionalUseCaseSchemaType } from '@etabli/src/models/entities/initiative';
import { prisma } from '@etabli/src/prisma/client';
import { initiativePrismaToModel } from '@etabli/src/server/routers/mappers';
import { apiHandlerWrapper } from '@etabli/src/utils/api';
import { initiativesToCsv } from '@etabli/src/utils/csv';
import { csvToXlsx } from '@etabli/src/utils/excel';

const __root_dirname = process.cwd();

const QueryParametersSchema = z.object({
  filetype: z.literal('xlsx').or(z.literal('csv')).or(z.literal('json')),
  format: z.literal('raw').optional(),
});

export async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { t } = getServerTranslation('common');

  const parameters = QueryParametersSchema.parse(req.query);
  const filename = `initiatives.${parameters.filetype}`;
  const rawFormat = parameters.format === 'raw';

  // Since this dataset is huge, we cache them locally for a few days
  const datasetPath = path.resolve(__root_dirname, `./data/datasets/${filename}`);
  let datasetExists = fsSync.existsSync(datasetPath);

  // If needed format the dataset file (we cache it for 1 day)
  if (datasetExists) {
    const currentDatasetFileInformation = await fs.stat(datasetPath);
    const currentDate = new Date();

    if (differenceInDays(currentDate, currentDatasetFileInformation.birthtime) > 1) {
      datasetExists = false;
    }
  }

  if (!datasetExists) {
    // In case parent folders does not exist yet
    await fs.mkdir(path.dirname(datasetPath), { recursive: true });

    const dbInitiatives = await prisma.initiative.findMany({
      include: {
        ToolsOnInitiatives: {
          include: {
            tool: {
              select: {
                name: true,
              },
            },
          },
        },
        BusinessUseCasesOnInitiatives: {
          include: {
            businessUseCase: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    const initiatives = dbInitiatives.map((dbInitiative) => {
      return initiativePrismaToModel({
        ...dbInitiative,
        businessUseCases: dbInitiative.BusinessUseCasesOnInitiatives.map((bucOnI) => bucOnI.businessUseCase.name),
        tools: dbInitiative.ToolsOnInitiatives.map((toolOnI) => toolOnI.tool.name),
      });
    });

    if (parameters.filetype === 'json') {
      const jsonInitiatives = initiatives.map((initiative) => {
        return {
          ...initiative,
          functionalUseCases: rawFormat
            ? initiative.functionalUseCases
            : initiative.functionalUseCases.map((functionalUseCase) =>
                t(`model.initiative.functionalUseCase.enum.${functionalUseCase as FunctionalUseCaseSchemaType}`)
              ),
        };
      });

      await fs.writeFile(datasetPath, JSON.stringify(jsonInitiatives));
    } else {
      const csvString = initiativesToCsv(initiatives, rawFormat);

      if (parameters.filetype === 'csv') {
        await fs.writeFile(datasetPath, csvString);
      } else {
        // Despite CSV working well for most of software (delimiter and UTF8) sometimes it has merged columns or encoding issues depending on the Excel versions
        // Since most of people have this tool we decided to provide a .xlsx aside the .csv
        const xlsxBuffer = await csvToXlsx(csvString);

        await fs.writeFile(datasetPath, xlsxBuffer);
      }
    }
  }

  // Read and send the dataset
  const datasetFileInformation = fsSync.statSync(datasetPath);
  const fileStream = fsSync.createReadStream(datasetPath);

  let contentType: string;
  switch (parameters.filetype) {
    case 'json':
      contentType = 'application/json';
      break;
    case 'csv':
      contentType = 'text/csv';
      break;
    case 'xlsx':
    default:
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': datasetFileInformation.size,
    'Content-Disposition': contentDisposition(`etabli-dataset-initiatives.${parameters.filetype}` || undefined, {
      type: 'attachment', // Force downloading the file even if the browser can display the JSON (this is due to providing huge files)
    }),
  });

  fileStream.pipe(res);
}

export default apiHandlerWrapper(handler);
