import type { GridColDef } from '@mui/x-data-grid';
import { DataGrid } from '@mui/x-data-grid/DataGrid';
import {
  // See Webpack aliases into `@etabli/.storybook/main.js` to understand why we use the browser version at the end even if not optimal
  parse,
} from 'csv-parse/browser/esm/sync';

export interface CsvViewerProps {
  data: string;
}

export function CsvViewer(props: CsvViewerProps) {
  const gridColumns: GridColDef<any>[] = [];

  const records = parse(props.data, {
    delimiter: ',',
    columns: (header) => {
      return header.map((column: string) => {
        gridColumns.push({
          field: column,
          headerName: column,
          flex: 1,
          minWidth: 150,
        });

        return column;
      });
    },
    cast_date: true,
    skip_empty_lines: true,
  });

  // DataGrid requires an unique id... adding it as a workaround since it's just a viewer to debug
  for (const recordKey of Object.keys(records)) {
    records[recordKey].id = recordKey;
  }

  return (
    <>
      <DataGrid
        rows={records}
        columns={gridColumns}
        pageSizeOptions={[]}
        autoHeight
        getRowHeight={() => 'auto'}
        disableColumnFilter
        disableColumnMenu
        disableRowSelectionOnClick
        aria-label="lignes dans un fichier CSV"
      />
    </>
  );
}
