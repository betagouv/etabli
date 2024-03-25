import {
  // See Webpack aliases into `@etabli/.storybook/main.js` to understand why we use the browser version at the end even if not optimal
  parse,
} from 'csv-parse/browser/esm';
import { Stringifier } from 'csv-stringify/.';
import ExcelJS from 'exceljs';
import { WriteStream } from 'fs';
import { Transform, pipeline } from 'stream';

export async function pipeCsvStreamToXlsxFileStream(inputCsvStream: Stringifier, outputWritableStream: WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    outputWritableStream.on('error', reject);
    outputWritableStream.on('finish', resolve);

    // Create a new Excel workbook and worksheet
    const workbookStream = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: outputWritableStream,
    });

    const worksheet = workbookStream.addWorksheet('Sheet 1');

    const csvParser = parse({
      delimiter: ',',
      cast: true,
      cast_date: true,
      skip_empty_lines: true,
    });

    pipeline(
      inputCsvStream,
      csvParser,
      new Transform({
        objectMode: true,
        transform: (row: any, encoding, callback) => {
          // To make stream working we had to use the `@zlooun/exceljs` fork, but it adds a lot of asynchronous stuff to commit ExcelJS mutations
          // Transform was the only way to manage async processing (standard `data/readable` callbacks do not handle this even if trying to use `pause/resume`)
          // Ref: https://github.com/exceljs/exceljs/issues/2200#issuecomment-1458816508
          worksheet
            .addRow(row)
            .commit()
            .then(() => {
              callback(null, undefined); // Since transform is in the latest position so no need to forward the row
            })
            .catch((error) => {
              callback(error, undefined);
            });
        },
      }),
      (error) => {
        if (error) {
          reject(error);
        } else {
          worksheet
            .commit()
            .then(() => {
              workbookStream.commit().catch(reject);
            })
            .catch(reject);
        }
      }
    );
  });
}
