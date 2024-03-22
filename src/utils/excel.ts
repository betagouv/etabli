import {
  // See Webpack aliases into `@etabli/.storybook/main.js` to understand why we use the browser version at the end even if not optimal
  parse,
} from 'csv-parse/browser/esm';
import ExcelJS from 'exceljs';

export async function csvToXlsx(content: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Create a new Excel workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet 1');

    parse(
      content,
      {
        delimiter: ',',
        cast: true,
        cast_date: true,
        skip_empty_lines: true,
      },
      (err, records) => {
        if (err) {
          reject(new Error('Error parsing CSV:', err));
        }

        // Add each row from the parsed CSV to the Excel worksheet
        records.forEach((row: any) => {
          worksheet.addRow(row);
        });

        // Save the Excel workbook to an XLSX file
        workbook.xlsx
          .writeBuffer()
          .then((buffer) => {
            resolve(buffer as Buffer); // Cast (ref: https://github.com/exceljs/exceljs/issues/1535)
          })
          .catch(reject);
      }
    );
  });
}
