import { differenceInHours } from 'date-fns/differenceInHours';
import fsSync from 'fs';
import fs from 'fs/promises';
import { JsonStreamStringify } from 'json-stream-stringify';
import path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';

import { retrieveInitiativesOrganizations } from '@etabli/src/features/organization-read';
import { getReputationReferenceRank } from '@etabli/src/features/reputation-read';
import { getServerTranslation } from '@etabli/src/i18n';
import { DatasetInitiativeSchemaType, FunctionalUseCaseSchemaType } from '@etabli/src/models/entities/initiative';
import { prisma } from '@etabli/src/prisma/client';
import { datasetInitiativePrismaToModel } from '@etabli/src/server/routers/mappers';
import { getInitiativesToCsvStream } from '@etabli/src/utils/csv';
import { pipeCsvStreamToXlsxFileStream } from '@etabli/src/utils/excel';

export type DatasetFiletype = 'json' | 'csv' | 'xlsx';

const datasetsDirectory = path.resolve(process.cwd(), './data/datasets');
const maximumDatasetAgeInHours = 24;
const chunkSize = 1_000;

export function getInitiativesDatasetFilename(filetype: DatasetFiletype, rawFormat: boolean): string {
  return `initiatives${rawFormat ? '-raw' : ''}.${filetype}`;
}

// Read chunk by chunk only when the file writing asks for more, so a few hundreds of initiatives are in memory at the same time
// whereas all of them were before (the database is far faster than formatting a spreadsheet)
export async function* readDatasetInitiatives(): AsyncGenerator<DatasetInitiativeSchemaType> {
  const reputationReferenceRank = await getReputationReferenceRank();
  let lastItem: { name: string; id: string } | null = null;

  // Each chunk starts after the values of the last item read, not after the row itself: with a Prisma cursor, a row removed in the
  // meantime (the feed runs while the file is generated) made the next chunk empty and the file was silently cut there
  const fetchChunk = (after: { name: string; id: string } | null) =>
    prisma.initiative.findMany({
      where: {
        deletedAt: null, // Removed sheets are no longer part of the directory
        ...(after ? { OR: [{ name: { gt: after.name } }, { name: after.name, id: { gt: after.id } }] } : {}),
      },
      select: {
        id: true,
        name: true,
        description: true,
        websites: true,
        repositories: true,
        functionalUseCases: true,
        createdAt: true,
        updatedAt: true,
        computedAt: true,
        reputationRank: true,
        deletedAt: true,
        ToolsOnInitiatives: { select: { tool: { select: { name: true } } } },
        BusinessUseCasesOnInitiatives: { select: { businessUseCase: { select: { name: true } } } },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: chunkSize,
    });

  while (true) {
    const chunkItems = await fetchChunk(lastItem);

    if (chunkItems.length === 0) {
      return;
    }

    const organizationsByInitiativeId = await retrieveInitiativesOrganizations(chunkItems.map((dbInitiative) => dbInitiative.id));

    for (const dbInitiative of chunkItems) {
      yield datasetInitiativePrismaToModel({
        ...dbInitiative,
        // The row itself is updated with any indicator, the date that matters to readers is the one of the description
        updatedAt: dbInitiative.computedAt ?? dbInitiative.createdAt,
        businessUseCases: dbInitiative.BusinessUseCasesOnInitiatives.map((bucOnI) => bucOnI.businessUseCase.name),
        tools: dbInitiative.ToolsOnInitiatives.map((toolOnI) => toolOnI.tool.name),
        organizations: organizationsByInitiativeId.get(dbInitiative.id) || [],
        reputationReferenceRank: reputationReferenceRank,
      });
    }

    if (chunkItems.length < chunkSize) {
      return;
    }

    const { name, id } = chunkItems[chunkItems.length - 1];

    lastItem = { name: name, id: id };
  }
}

export async function generateInitiativesDatasetFile(filetype: DatasetFiletype, rawFormat: boolean, outputPath: string): Promise<void> {
  const { t } = getServerTranslation('common');
  const initiativesStream = Readable.from(readDatasetInitiatives(), { objectMode: true, highWaterMark: 100 });
  const outputStream = fsSync.createWriteStream(outputPath);

  if (filetype === 'json') {
    const translatedStream = initiativesStream.pipe(
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
      })
    );

    // The JSON format is not just about appending objects due to the wrapping array
    await pipeline(new JsonStreamStringify(translatedStream), outputStream);
  } else if (filetype === 'csv') {
    await pipeline(initiativesStream, getInitiativesToCsvStream(rawFormat), outputStream);
  } else {
    // Despite CSV working well for most of software sometimes it has merged columns or encoding issues depending on the Excel versions,
    // and since most of people have this tool a .xlsx is provided aside the .csv
    const csvStream = getInitiativesToCsvStream(rawFormat);

    await Promise.all([pipeline(initiativesStream, csvStream), pipeCsvStreamToXlsxFileStream(csvStream, outputStream)]);
  }
}

async function getDatasetModificationDate(datasetPath: string): Promise<Date | null> {
  try {
    return (await fs.stat(datasetPath)).mtime;
  } catch (error) {
    return null;
  }
}

function isDatasetFresh(modificationDate: Date | null): boolean {
  return !!modificationDate && differenceInHours(new Date(), modificationDate) < maximumDatasetAgeInHours;
}

// Requests of the same file wait for the same generation, and generations run one after the other: data.gouv.fr asks for all files
// at once, and a few generations together were enough to exhaust the memory of the server
const pendingGenerations = new Map<string, Promise<void>>();
let generationsQueue: Promise<unknown> = Promise.resolve();

export async function getInitiativesDatasetPath(filetype: DatasetFiletype, rawFormat: boolean): Promise<string> {
  const filename = getInitiativesDatasetFilename(filetype, rawFormat);
  const datasetPath = path.resolve(datasetsDirectory, filename);
  const modificationDate = await getDatasetModificationDate(datasetPath);

  if (isDatasetFresh(modificationDate)) {
    return datasetPath;
  }

  let generation = pendingGenerations.get(filename);

  if (!generation) {
    generation = generationsQueue
      .catch(() => {
        // A previous failure does not concern this file
      })
      .then(async () => {
        if (isDatasetFresh(await getDatasetModificationDate(datasetPath))) {
          return;
        }

        console.log(`the dataset "${filename}" is going to be computed`);

        await fs.mkdir(datasetsDirectory, { recursive: true });

        // Written aside then renamed, so a file being written is never served
        const temporaryPath = `${datasetPath}.${process.pid}.${Date.now()}.tmp`;

        try {
          await generateInitiativesDatasetFile(filetype, rawFormat, temporaryPath);
          await fs.rename(temporaryPath, datasetPath);
        } catch (error) {
          await fs.rm(temporaryPath, { force: true });

          throw error;
        }

        console.log(`the dataset "${filename}" has been computed and is ready to be served`);
      })
      .finally(() => {
        pendingGenerations.delete(filename);
      });

    generationsQueue = generation;
    pendingGenerations.set(filename, generation);
  }

  // An outdated file is still served right away while the new one is computed (it takes minutes, requests were timing out),
  // only the very first generation has to be waited for
  if (modificationDate) {
    generation.catch((error) => {
      console.error(`the dataset "${filename}" could not be refreshed, the previous one is still served`);
      console.error(error);
    });

    return datasetPath;
  }

  await generation;

  return datasetPath;
}
