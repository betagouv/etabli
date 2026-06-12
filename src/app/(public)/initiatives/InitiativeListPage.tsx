'use client';

import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ClearIcon from '@mui/icons-material/Clear';
import FilterListIcon from '@mui/icons-material/FilterList';
import GridViewIcon from '@mui/icons-material/GridView';
import SearchIcon from '@mui/icons-material/Search';
import TableRowsIcon from '@mui/icons-material/TableRows';
import Alert from '@mui/material/Alert';
import Badge from '@mui/material/Badge';
import Button from '@mui/material/Button';
import Grid, { GridProps } from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Pagination from '@mui/material/Pagination';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { push } from '@socialgouv/matomo-next';
import debounce from 'lodash.debounce';
import NextLink from 'next/link';
import { parseAsArrayOf, parseAsBoolean, parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePrevious, useUpdateEffect } from 'react-use';

import { trpc } from '@etabli/src/client/trpcClient';
import { ErrorAlert } from '@etabli/src/components/ErrorAlert';
import {
  InitiativeFiltersModal,
  InitiativeFiltersValue,
  countActiveFilters,
  emptyInitiativeFilters,
} from '@etabli/src/components/InitiativeFiltersModal';
import { InitiativeList } from '@etabli/src/components/InitiativeList';
import { LoadingArea } from '@etabli/src/components/LoadingArea';
import { PaginationSize } from '@etabli/src/models/actions/common';
import { FunctionalUseCaseSchema } from '@etabli/src/models/entities/initiative';
import { ListDisplay, useLocalStorageListDisplay } from '@etabli/src/utils/display';
import { centeredAlertContainerGridProps, wideContainerGridProps } from '@etabli/src/utils/grid';
import { linkRegistry } from '@etabli/src/utils/routes/registry';
import { AggregatedQueries } from '@etabli/src/utils/trpc';

export enum ListFilter {
  ALL = 1,
  OPEN_ONLY,
  CLOSE_ONLY,
}

const reusableCentering: GridProps['sx'] = {
  ...wideContainerGridProps.sx,
  py: 0,
  maxWidth: 'lg',
  mx: 'auto',
};

export const InitiativeListPageContext = createContext({
  ContextualInitiativeList: InitiativeList,
});

export interface InitiativeListPageProps {}

export function InitiativeListPage(props: InitiativeListPageProps) {
  const { ContextualInitiativeList } = useContext(InitiativeListPageContext);

  const assistantPath = linkRegistry.get('assistant', undefined);

  const [params, setParams] = useQueryStates(
    {
      q: parseAsString.withDefault(''),
      fnc: parseAsArrayOf(parseAsStringLiteral(FunctionalUseCaseSchema.options)).withDefault([]),
      tools: parseAsArrayOf(parseAsString).withDefault([]),
      hasWeb: parseAsBoolean.withDefault(false),
      hasRepo: parseAsBoolean.withDefault(false),
      page: parseAsInteger.withDefault(1),
    },
    { history: 'push', clearOnDefault: true }
  );

  const filtersValue: InitiativeFiltersValue = useMemo(
    () => ({
      functionalUseCases: params.fnc,
      toolIds: params.tools,
      hasWebsite: params.hasWeb,
      hasRepository: params.hasRepo,
    }),
    [params.fnc, params.tools, params.hasWeb, params.hasRepo]
  );

  const activeFiltersCount = countActiveFilters(filtersValue);
  const hasSearchQuery = params.q.trim().length > 0;
  const hasAnyCriterion = hasSearchQuery || activeFiltersCount > 0;

  const queryRef = React.createRef<HTMLInputElement>();
  const [searchQueryManipulated, setSearchQueryManipulated] = useState(false);
  const [filtersModalOpen, setFiltersModalOpen] = useState(false);
  const [listDisplay, setListDisplay] = useLocalStorageListDisplay();
  const [possiblePageSizes] = useState<PaginationSize[]>(() => [PaginationSize.size10, PaginationSize.size25, PaginationSize.size50]);
  const [pageSize, setPageSize] = useState<PaginationSize>(() => possiblePageSizes[0]);
  const prevPage = usePrevious(params.page);

  const listInitiatives = trpc.listInitiatives.useQuery({
    page: params.page,
    pageSize: pageSize,
    orderBy: {},
    filterBy: {
      query: hasSearchQuery ? params.q : null,
      functionalUseCases: params.fnc.length > 0 ? params.fnc : undefined,
      toolIds: params.tools.length > 0 ? params.tools : undefined,
      hasWebsite: params.hasWeb || undefined,
      hasRepository: params.hasRepo || undefined,
    },
  });

  useUpdateEffect(() => {
    if (!hasSearchQuery) {
      return;
    }

    // If the query is different, track the new search (without the query)
    push(['trackEvent', 'directory', 'search', 'words', params.q.split(' ').length]);
  }, [params.q]);

  useUpdateEffect(() => {
    // [WORKAROUND] For whatever reason it triggers at start despite `setCurrentPage` not being called, so have to compare the value to avoid this
    if (prevPage === undefined || prevPage === params.page) {
      return;
    }

    push(['trackEvent', 'directory', 'changePage', 'number', params.page]);
  }, [params.page, prevPage]);

  const aggregatedQueries = new AggregatedQueries(listInitiatives);

  const handleSearchQueryChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      // If this is a new query, perform necessary changes
      const next = event.target.value;
      if (next !== params.q) {
        setSearchQueryManipulated(true);

        // Reset to page 1 since the new query may yield a much smaller total set.
        setParams({ q: next || null, page: 1 });
      }
    },
    [params.q, setParams]
  );

  const debouncedSearchChange = useMemo(
    () => debounce(handleSearchQueryChange, 1200), // longer than usual: the query hits the LLM and we throttle to the LLM rate limit.
    [handleSearchQueryChange]
  );
  useEffect(() => {
    return () => {
      debouncedSearchChange.cancel();
    };
  }, [debouncedSearchChange]);

  // The input is uncontrolled (debounce-friendly) so when the URL `q` changes from outside (browser back,
  // explore deep-link, "Réinitialiser"…) we need to push the new value back into the DOM input.
  useEffect(() => {
    if (queryRef.current && queryRef.current.value !== params.q) {
      queryRef.current.value = params.q;
    }
  }, [params.q, queryRef]);

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
    if (pagesCount && params.page > pagesCount) {
      setParams({ page: pagesCount });
    }
  }, [pagesCount, params.page, setParams]);

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
    setParams({ q: null, page: 1 });
    if (queryRef.current) {
      queryRef.current.value = '';
    }
  };

  const applyFilters = (next: InitiativeFiltersValue) => {
    setParams({
      fnc: next.functionalUseCases.length > 0 ? next.functionalUseCases : null,
      tools: next.toolIds.length > 0 ? next.toolIds : null,
      hasWeb: next.hasWebsite ? true : null,
      hasRepo: next.hasRepository ? true : null,
      page: 1,
    });
    setFiltersModalOpen(false);
  };

  const resetFilters = () => {
    setParams({ fnc: null, tools: null, hasWeb: null, hasRepo: null, page: 1 });
  };

  const hasResults = initiatives.length > 0;
  const noResultsWithCriteria = !hasResults && hasAnyCriterion;

  const assistantLink = (
    <Link component={NextLink} href={assistantPath} underline="none">
      en parler à notre assistant
    </Link>
  );

  return (
    <>
      <Grid container sx={{ ...wideContainerGridProps.sx, px: 0 }} direction="column" alignContent="flex-start">
        <Grid item sx={{ width: '100%' }}>
          <Grid container sx={reusableCentering}>
            <Grid item xs={12} sx={{ pb: 3 }}>
              <Typography component="h1" variant="h5">
                Annuaire des initiatives
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Vous ne trouvez pas l&apos;initiative qui correspond à votre besoin&nbsp;?{' '}
                <Link component={NextLink} href={assistantPath} underline="none">
                  Notre assistant
                </Link>{' '}
                peut vous aider.
              </Typography>
            </Grid>
            <Grid item xs={12} sx={{ mb: 3 }}>
              <TextField
                type="text"
                name="search"
                placeholder="Rechercher... (que ce soit un nom, un outil, un cas d'utilisation)"
                inputRef={queryRef}
                defaultValue={params.q}
                onChange={debouncedSearchChange}
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      {hasSearchQuery && (
                        <IconButton aria-label="effacer la recherche" onClick={handleClearQuery}>
                          <ClearIcon />
                        </IconButton>
                      )}
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
          </Grid>
        </Grid>
        {!listInitiatives.isLoading ? (
          <>
            <Grid item sx={{ width: '100%' }}>
              <Grid container sx={reusableCentering}>
                <Grid item xs={12} sx={{ py: 1 }}>
                  <Grid container spacing={1} alignContent="flex-start" alignItems="center">
                    <Grid item>
                      <Button
                        variant={activeFiltersCount > 0 ? 'contained' : 'outlined'}
                        color="primary"
                        startIcon={
                          <Badge color="error" badgeContent={activeFiltersCount} invisible={activeFiltersCount === 0}>
                            <FilterListIcon />
                          </Badge>
                        }
                        onClick={() => setFiltersModalOpen(true)}
                        sx={{ height: 40 }} // align with the ToggleButtonGroup on the right (MUI Button medium is ~36px, ToggleButton medium is ~40px).
                      >
                        Filtres
                      </Button>
                    </Grid>
                    {activeFiltersCount > 0 && (
                      <Grid item>
                        <Button variant="text" size="small" onClick={resetFilters}>
                          Réinitialiser
                        </Button>
                      </Grid>
                    )}
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
              </Grid>
            </Grid>
            {hasResults ? (
              <Grid item sx={{ width: '100%' }}>
                <Grid container direction="column">
                  <Grid
                    container
                    sx={
                      listDisplay === ListDisplay.TABLE
                        ? { ...reusableCentering, maxWidth: 1600 } // wider table layout — `lg` was too cramped.
                        : reusableCentering
                    }
                  >
                    <ContextualInitiativeList initiatives={initiatives} display={listDisplay} />
                  </Grid>
                  {params.page >= 2 && (
                    <Grid container sx={reusableCentering}>
                      <Grid item xs={12} sx={{ mt: 3 }}>
                        <Alert severity="info">
                          Vous n&apos;avez pas trouvé&nbsp;? Préciser votre recherche, ajouter des filtres ou {assistantLink} peut aider.
                        </Alert>
                      </Grid>
                    </Grid>
                  )}
                  <Grid container justifyContent="space-between" alignItems="center" rowSpacing={2} sx={{ ...reusableCentering, mt: 3 }}>
                    <Grid item>
                      <Stack direction="row" spacing={2} alignItems="center">
                        {totalCount >= 0 && (
                          <Typography variant="body2" color="text.secondary">
                            {totalCount}&nbsp;initiative{totalCount > 1 ? 's' : ''}
                          </Typography>
                        )}
                        <TextField
                          select
                          size="small"
                          label="Par page"
                          value={pageSize}
                          onChange={(event) => {
                            setPageSize(event.target.value as unknown as PaginationSize);
                            setParams({ page: 1 }); // a bigger page size shrinks the total pages, so go back to a guaranteed-valid page
                          }}
                          sx={{ minWidth: 110 }}
                        >
                          {possiblePageSizes.map((size) => (
                            <MenuItem key={size} value={size}>
                              {size}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Stack>
                    </Grid>
                    <Grid item>
                      <Pagination
                        count={pagesCount ?? 1}
                        page={params.page}
                        onChange={(event, pageNumber) => {
                          setParams({ page: pageNumber });
                        }}
                        color="primary"
                        showFirstButton
                        showLastButton
                        siblingCount={1}
                        boundaryCount={1}
                        getItemAriaLabel={(type, page) => {
                          switch (type) {
                            case 'first':
                              return 'première page';
                            case 'last':
                              return 'dernière page';
                            case 'previous':
                              return 'page précédente';
                            case 'next':
                              return 'page suivante';
                            default:
                              return `page ${page}`;
                          }
                        }}
                      />
                    </Grid>
                  </Grid>
                </Grid>
              </Grid>
            ) : (
              <Grid item sx={{ width: '100%' }}>
                <Grid container sx={reusableCentering}>
                  <Grid item xs={12} sx={{ py: 2 }}>
                    {!noResultsWithCriteria ? (
                      <Typography variant="body2">Aucune initiative n&apos;a été indexée pour le moment</Typography>
                    ) : (
                      <Alert severity="info">
                        <Typography variant="body2" sx={{ mb: 1 }}>
                          Aucune initiative ne correspond à votre recherche ou à vos filtres.
                        </Typography>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} sx={{ mt: 1 }}>
                          {activeFiltersCount > 0 && (
                            <Button size="small" variant="outlined" onClick={resetFilters}>
                              Retirer les filtres
                            </Button>
                          )}
                          <Button size="small" variant="contained" component={NextLink} href={assistantPath} startIcon={<ChatBubbleOutlineIcon />}>
                            Parler à l&apos;assistant
                          </Button>
                        </Stack>
                      </Alert>
                    )}
                  </Grid>
                </Grid>
              </Grid>
            )}
          </>
        ) : (
          <LoadingArea ariaLabelTarget="liste des initiatives" />
        )}
      </Grid>
      <InitiativeFiltersModal open={filtersModalOpen} value={filtersValue} onClose={() => setFiltersModalOpen(false)} onApply={applyFilters} />
    </>
  );
}
