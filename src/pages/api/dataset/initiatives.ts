import contentDisposition from 'content-disposition';
import { differenceInDays } from 'date-fns/differenceInDays';
import fsSync from 'fs';
import fs from 'fs/promises';
import { JsonStreamStringify } from 'json-stream-stringify';
import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import { Readable, Transform, pipeline } from 'stream';
import { z } from 'zod';

import { getServerTranslation } from '@etabli/src/i18n';
import { DatasetInitiativeSchemaType, FunctionalUseCaseSchemaType } from '@etabli/src/models/entities/initiative';
import { prisma } from '@etabli/src/prisma/client';
import { datasetInitiativePrismaToModel } from '@etabli/src/server/routers/mappers';
import { apiHandlerWrapper } from '@etabli/src/utils/api';
import { getInitiativesToCsvStream } from '@etabli/src/utils/csv';
import { pipeCsvStreamToXlsxFileStream } from '@etabli/src/utils/excel';

const __root_dirname = process.cwd();

const QueryParametersSchema = z.object({
  filetype: z.literal('xlsx').or(z.literal('csv')).or(z.literal('json')),
  format: z.literal('raw').optional(),
});

export const config = {
  api: {
    responseLimit: '50mb', // Only show a Next.js warning if the response is above 50 MB (currently around ~25 MB)
  },
};

export async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { t } = getServerTranslation('common');

  const parameters = QueryParametersSchema.parse(req.query);
  const rawFormat = parameters.format === 'raw';
  const filename = `initiatives${rawFormat ? '-raw' : ''}.${parameters.filetype}`;

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
      select: {
        id: true,
        name: true,
        description: true,
        websites: true,
        repositories: true,
        functionalUseCases: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        ToolsOnInitiatives: {
          select: {
            tool: {
              select: {
                name: true,
              },
            },
          },
        },
        BusinessUseCasesOnInitiatives: {
          select: {
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

    // Below we try to maximize performance with streams so production environment can have low memory capacity and does not crash
    try {
      await new Promise<void>((resolve, reject) => {
        const writableFileStream = fsSync.createWriteStream(datasetPath);
        const initiativesStream = new Readable({ objectMode: true, read() {} });

        if (parameters.filetype === 'json') {
          // Replace technical values is requested
          const jsonContentStream = pipeline(
            initiativesStream,
            new Transform({
              objectMode: true,
              transform: (initiative: DatasetInitiativeSchemaType, encoding, callback) => {
                callback(null, {
                  ...initiative,
                  functionalUseCases: rawFormat
                    ? initiative.functionalUseCases
                    : initiative.functionalUseCases.map((functionalUseCase) =>
                        t(`model.initiative.functionalUseCase.enum.${functionalUseCase as FunctionalUseCaseSchemaType}`)
                      ),
                });
              },
            }),
            (error) => {
              if (error) {
                reject(error);
              }
            }
          );

          // We have to use a specific stream writer since JSON format is not just about appending a object (due to the wrapping array)
          // const jsonWritableFileStream = new JsonStreamStringify({ salut: jsonContentStream });
          const jsonWritableFileStream = new JsonStreamStringify(jsonContentStream);

          pipeline(jsonWritableFileStream, writableFileStream, (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        } else {
          const initiativesToCsvStream = getInitiativesToCsvStream(rawFormat);

          if (parameters.filetype === 'csv') {
            pipeline(initiativesStream, initiativesToCsvStream, writableFileStream, (error) => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            });
          } else {
            // Despite CSV working well for most of software (delimiter and UTF8) sometimes it has merged columns or encoding issues depending on the Excel versions
            // Since most of people have this tool we decided to provide a .xlsx aside the .csv
            const csvStream = pipeline(initiativesStream, initiativesToCsvStream, (error) => {
              if (error) {
                reject(error);
              }
            });

            // The ExcelJS stream API is specific so it's handled inside the helper
            pipeCsvStreamToXlsxFileStream(csvStream, writableFileStream).then(resolve).catch(reject);
          }
        }

        for (const dbInitiative of dbInitiatives) {
          initiativesStream.push(
            datasetInitiativePrismaToModel({
              ...dbInitiative,
              businessUseCases: dbInitiative.BusinessUseCasesOnInitiatives.map((bucOnI) => bucOnI.businessUseCase.name),
              tools: dbInitiative.ToolsOnInitiatives.map((toolOnI) => toolOnI.tool.name),
            })
          );
        }

        // Signal the end of the stream
        initiativesStream.push(null);
      });
    } catch (error) {
      // Since there was an error while writing the file, we delete any partial writing so on next calls it's retried
      if (fsSync.existsSync(datasetPath)) {
        await fs.rm(datasetPath);
      }

      throw error;
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
