'use client';

import ClearIcon from '@mui/icons-material/Clear';
import GridViewIcon from '@mui/icons-material/GridView';
import SearchIcon from '@mui/icons-material/Search';
import TableRowsIcon from '@mui/icons-material/TableRows';
import Alert from '@mui/material/Alert';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TablePagination from '@mui/material/TablePagination';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { push } from '@socialgouv/matomo-next';
import debounce from 'lodash.debounce';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { usePrevious, useUpdateEffect } from 'react-use';

import { trpc } from '@etabli/src/client/trpcClient';
import { ErrorAlert } from '@etabli/src/components/ErrorAlert';
import { InitiativeList } from '@etabli/src/components/InitiativeList';
import { LoadingArea } from '@etabli/src/components/LoadingArea';
import { PaginationSize } from '@etabli/src/models/actions/common';
import { ListDisplay, useLocalStorageListDisplay } from '@etabli/src/utils/display';
import { centeredAlertContainerGridProps, centeredContainerGridProps } from '@etabli/src/utils/grid';
import { AggregatedQueries } from '@etabli/src/utils/trpc';

export enum ListFilter {
  ALL = 1,
  OPEN_ONLY,
  CLOSE_ONLY,
}

export const InitiativeListPageContext = createContext({
  ContextualInitiativeList: InitiativeList,
});

export interface InitiativeListPageProps {}

export function InitiativeListPage(props: InitiativeListPageProps) {
  const { ContextualInitiativeList } = useContext(InitiativeListPageContext);

  const queryRef = React.createRef<HTMLInputElement>();
  const [searchQueryManipulated, setSearchQueryManipulated] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [listDisplay, setListDisplay] = useLocalStorageListDisplay();
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [possiblePageSizes] = useState<PaginationSize[]>(() => [PaginationSize.size10, PaginationSize.size25, PaginationSize.size50]);
  const [pageSize, setPageSize] = useState<PaginationSize>(() => possiblePageSizes[0]);
  const prevCurrentPage = usePrevious(currentPage);

  const listInitiatives = trpc.listInitiatives.useQuery({
    page: currentPage,
    pageSize: pageSize,
    orderBy: {},
    filterBy: {
      query: searchQuery,
    },
  });

  useUpdateEffect(() => {
    if (!searchQuery) {
      return;
    }

    // If the query is different, track the new search (without the query)
    push(['trackEvent', 'directory', 'search', 'words', searchQuery.split(' ').length]);
  }, [searchQuery]);

  useUpdateEffect(() => {
    // [WORKAROUND] For whatever reason it triggers at start despite `setCurrentPage` not being called, so have to compare the value to avoid this
    if (prevCurrentPage === undefined || prevCurrentPage === currentPage) {
      return;
    }

    push(['trackEvent', 'directory', 'changePage', 'number', currentPage]);
  }, [currentPage, prevCurrentPage]);

  const aggregatedQueries = new AggregatedQueries(listInitiatives);

  const handleSearchQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQueryManipulated(true);
    setSearchQuery(event.target.value);
  };

  const debounedHandleClearQuery = useMemo(() => debounce(handleSearchQueryChange, 1200), []); // We wait more than the usual `500ms` because it reaches the LLM system to embed the query and we must comply with the rate limit for this
  useEffect(() => {
    return () => {
      debounedHandleClearQuery.cancel();
    };
  }, [debounedHandleClearQuery]);

  const { initiatives, pagesCount, totalCount } = useMemo(() => {
    return !!listInitiatives.data
      ? {
          initiatives: listInitiatives.data.initiatives,
          pagesCount: Math.ceil(listInitiatives.data.totalCount / pageSize),
          totalCount: listInitiatives.data.totalCount,
        }
      : {
          initiatives: [],
          pagesCount: null,
          totalCount: -1, // -1 for the pagination component
        };
  }, [listInitiatives.data, pageSize]);

  // Adjust the page in case the server removes some items in the meantime
  // Note: we make sure it does not apply when loading another page since values are reset
  useEffect(() => {
    if (pagesCount && currentPage > pagesCount) {
      setCurrentPage(pagesCount);
    }
  }, [pagesCount, currentPage]);

  if (aggregatedQueries.hasError) {
    return (
      <Grid container {...centeredAlertContainerGridProps}>
        <ErrorAlert errors={aggregatedQueries.errors} refetchs={aggregatedQueries.refetchs} />
      </Grid>
    );
  } else if (aggregatedQueries.isInitialLoading && !searchQueryManipulated) {
    return <LoadingArea ariaLabelTarget="page" />;
  }

  const handleClearQuery = () => {
    setSearchQuery(null);

    // We did not bind the TextField to "searchQuery" to allow delaying requests
    if (queryRef.current) {
      queryRef.current.value = '';
    }
  };

  return (
    <>
      <Grid container {...centeredContainerGridProps} alignContent="flex-start">
        <Grid item xs={12} sx={{ pb: 3 }}>
          <Alert severity="info" sx={{ mb: 3 }}>
            {/* TODO: remove when appropriate */}
            Dû à notre phase de tests, notre annuaire contient 2000 initiatives sur les 40 000 possibles. Nous avons principalement référencé celles
            liées au gouvernement, nous les référencerons toutes sous peu.
          </Alert>
          <Typography component="h1" variant="h5">
            Annuaire des initiatives
          </Typography>
        </Grid>
        <Grid item xs={12} sx={{ mb: 3 }}>
          <TextField
            type="text"
            name="search"
            placeholder="Rechercher... (que ce soit un nom, un outil, un cas d'utilisation)"
            inputRef={queryRef}
            onChange={debounedHandleClearQuery}
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  {searchQuery && searchQuery !== '' && (
                    <IconButton aria-label="effacer la recherche" onClick={handleClearQuery}>
                      <ClearIcon />
                    </IconButton>
                  )}
                </InputAdornment>
              ),
            }}
          />
        </Grid>
        {!listInitiatives.isLoading ? (
          <>
            <Grid item xs={12} sx={{ py: 1 }}>
              <Grid container spacing={1} alignContent="flex-start">
                <Grid item sx={{ ml: 'auto' }}>
                  <ToggleButtonGroup
                    color="primary"
                    value={listDisplay}
                    exclusive
                    onChange={(event, newValue) => {
                      if (newValue !== null) {
                        setListDisplay(newValue);
                      }
                    }}
                    aria-label="affichage de la liste"
                  >
                    <ToggleButton value={ListDisplay.GRID} aria-label="grille">
                      <GridViewIcon />
                    </ToggleButton>
                    <ToggleButton value={ListDisplay.TABLE} aria-label="tableau">
                      <TableRowsIcon />
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Grid>
              </Grid>
            </Grid>
            {initiatives.length ? (
              <Grid item xs={12}>
                <Grid container spacing={1} direction="column">
                  <Grid item sx={{ width: '100%' }}>
                    <ContextualInitiativeList initiatives={initiatives} display={listDisplay} />
                    <TablePagination
                      component="div"
                      rowsPerPageOptions={possiblePageSizes}
                      count={totalCount}
                      rowsPerPage={pageSize}
                      page={currentPage - 1} // Starting at 0
                      onPageChange={(event, pageNumber) => {
                        setCurrentPage(pageNumber + 1);
                      }}
                      onRowsPerPageChange={(event) => {
                        setPageSize(event.target.value as unknown as PaginationSize);
                      }}
                      sx={{
                        mt: 3,
                        '& > .MuiToolbar-root > p': {
                          margin: 'auto', // For whatever reason the text elements stick to the top otherwise
                        },
                      }}
                    />
                  </Grid>
                </Grid>
              </Grid>
            ) : (
              <Grid item xs={12} sx={{ py: 2 }}>
                <Typography variant="body2">
                  {initiatives.length === 0 && (!searchQuery || searchQuery === '')
                    ? `Aucune initiative n'a été indexée pour le moment`
                    : 'Aucune initiative trouvée pour la recherche spécifiée'}
                </Typography>
              </Grid>
            )}
          </>
        ) : (
          <LoadingArea ariaLabelTarget="liste des initiatives" />
        )}
      </Grid>
    </>
  );
}
