import contentDisposition from 'content-disposition';
import fs from 'fs/promises';
import { NextApiRequest, NextApiResponse } from 'next';
import { pipeline } from 'stream/promises';
import { z } from 'zod';

import { getInitiativesDatasetPath } from '@etabli/src/features/initiatives-dataset';
import { apiHandlerWrapper } from '@etabli/src/utils/api';

const QueryParametersSchema = z.object({
  filetype: z.literal('xlsx').or(z.literal('csv')).or(z.literal('json')),
  format: z.literal('raw').optional(),
});

export const config = {
  api: {
    responseLimit: '100mb', // Only show a Next.js warning if the response is above 100 MB (the JSON file is around 50 MB)
  },
};

export async function handler(req: NextApiRequest, res: NextApiResponse) {
  const parameters = QueryParametersSchema.parse(req.query);
  const rawFormat = parameters.format === 'raw';

  // Since this dataset is huge, it is computed at most once a day and served from a file
  const datasetPath = await getInitiativesDatasetPath(parameters.filetype, rawFormat);

  // The file is opened before reading its size, so a newer dataset renamed in the meantime cannot mismatch the announced length
  const fileHandle = await fs.open(datasetPath, 'r');
  const datasetFileInformation = await fileHandle.stat();
  const fileStream = fileHandle.createReadStream(); // It closes the file once finished or destroyed

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
    'Last-Modified': datasetFileInformation.mtime.toUTCString(),
    'Cache-Control': 'public, max-age=3600', // Generated at most once a day, intermediaries can keep it a bit
  });

  // Unlike `.pipe()` a reading error or the client leaving destroys both streams instead of leaving them open
  try {
    await pipeline(fileStream, res);
  } catch (error) {
    console.error(error); // Headers are already sent, nothing else can be told to the client
  }
}

export default apiHandlerWrapper(handler);
