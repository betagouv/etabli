import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import type { GridColDef } from '@mui/x-data-grid';
import { DataGrid } from '@mui/x-data-grid/DataGrid';
import NextLink from 'next/link';

import { BusinessUseCaseChip } from '@etabli/src/components/BusinessUseCaseChip';
import { InitiativeCard } from '@etabli/src/components/InitiativeCard';
import { InitiativeSchemaType } from '@etabli/src/models/entities/initiative';
import { ListDisplay } from '@etabli/src/utils/display';
import { ulComponentResetStyles } from '@etabli/src/utils/grid';
import { linkRegistry } from '@etabli/src/utils/routes/registry';
import { nameof } from '@etabli/src/utils/typescript';

const typedNameof = nameof<InitiativeSchemaType>;

export interface InitiativeListProps {
  initiatives: InitiativeSchemaType[];
  display: ListDisplay;
}

export function InitiativeList(props: InitiativeListProps) {
  // To type options functions have a look at https://github.com/mui/mui-x/pull/4064
  const columns: GridColDef<InitiativeSchemaType>[] = [
    {
      field: typedNameof('name'),
      headerName: 'Nom',
      flex: 1,
      renderCell: (params) => {
        return (
          <Link component={NextLink} href={linkRegistry.get('initiative', { initiativeId: params.row.id })} variant="subtitle2" underline="none">
            {params.row.name}
          </Link>
        );
      },
    },
    {
      field: typedNameof('businessUseCases'),
      headerName: "Cas d'utilisation métiers",
      flex: 1,
      renderCell: (params) => {
        return params.row.businessUseCases.length > 0 ? (
          <Grid container component="ul" direction="row" spacing={1} sx={{ ...ulComponentResetStyles, overflow: 'hidden' }}>
            {params.row.businessUseCases.map((businessUseCase) => {
              return (
                <Grid key={businessUseCase} item component="li">
                  <BusinessUseCaseChip label={businessUseCase} />
                </Grid>
              );
            })}
          </Grid>
        ) : null;
      },
    },
    {
      field: 'websites_and_repositories',
      headerName: 'Références principales',
      flex: 1,
      renderCell: (params) => {
        const referencesLinks: string[] = [];

        // Consider as "principal" the main website and the main repository
        if (params.row.websites.length > 0) {
          referencesLinks.push(params.row.websites[0]);
        }
        if (params.row.repositories.length > 0) {
          referencesLinks.push(params.row.repositories[0]);
        }

        return referencesLinks.length > 0 ? (
          <ul style={{ ...ulComponentResetStyles }}>
            {referencesLinks.map((referenceLink) => {
              return (
                <li key={referenceLink}>
                  <Link component={NextLink} href={referenceLink} variant="subtitle2" underline="none" target="_blank">
                    {referenceLink}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null;
      },
    },
  ];

  return (
    <>
      {props.display === ListDisplay.TABLE ? (
        <DataGrid
          rows={props.initiatives}
          getRowId={(row) => row.id}
          columns={columns}
          hideFooterPagination={true}
          hideFooter={true} // At the end we hide the global footer to not have a white space
          autoHeight
          getRowHeight={() => 'auto'}
          disableColumnFilter
          disableColumnMenu
          disableRowSelectionOnClick
          sx={{
            '&.MuiDataGrid-root .MuiDataGrid-cell:focus-within': {
              outline: 'none !important', // Remove the outline when focusing any cell
            },
          }}
          aria-label="liste des initiatives"
          data-sentry-mask
        />
      ) : (
        <>
          {/* We use "grid+row" as of the DataGrid instead of "ul+li" for stories tests to pass (cannot perform a "or") */}
          <Grid container component="ul" spacing={2} sx={ulComponentResetStyles} aria-label="liste des initiatives">
            {props.initiatives.map((initiative) => (
              <Grid key={initiative.id} item component="li" xs={12} sm={6}>
                <InitiativeCard
                  initiativeLink={linkRegistry.get('initiative', {
                    initiativeId: initiative.id,
                  })}
                  initiative={initiative}
                />
              </Grid>
            ))}
          </Grid>
        </>
      )}
    </>
  );
}
