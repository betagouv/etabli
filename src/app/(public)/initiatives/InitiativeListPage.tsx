'use client';

import BubbleChartIcon from '@mui/icons-material/BubbleChart';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ClearIcon from '@mui/icons-material/Clear';
import FilterListIcon from '@mui/icons-material/FilterList';
import GridViewIcon from '@mui/icons-material/GridView';
import SearchIcon from '@mui/icons-material/Search';
import TableRowsIcon from '@mui/icons-material/TableRows';
import ViewListIcon from '@mui/icons-material/ViewList';
import Alert from '@mui/material/Alert';
import Badge from '@mui/material/Badge';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
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
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { push } from '@socialgouv/matomo-next';
import debounce from 'lodash.debounce';
import NextLink from 'next/link';
import { createSerializer, parseAsArrayOf, parseAsBoolean, parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePrevious, useUpdateEffect } from 'react-use';

import { OrganizationsMap } from '@etabli/src/app/(public)/initiatives/OrganizationsMap';
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
import { OrganizationTree } from '@etabli/src/components/OrganizationTree';
import { PaginationSize } from '@etabli/src/models/actions/common';
import {
  InitiativesOrderSchema,
  InitiativesOrderSchemaType,
  ListInitiativesSchemaType,
  maximumFilteredOrganizations,
  unclassifiedInitiativesNodeId,
} from '@etabli/src/models/actions/initiative';
import { FunctionalUseCaseSchema, GradeLetterSchema, LegalLinkPresenceSchema } from '@etabli/src/models/entities/initiative';
import { ListDisplay, useLocalStorageListDisplay } from '@etabli/src/utils/display';
import { getForeignDependencyLevelLabel } from '@etabli/src/utils/foreign-dependencies';
import { centeredAlertContainerGridProps, wideContainerGridProps } from '@etabli/src/utils/grid';
import { narrowOrganizationsToNode } from '@etabli/src/utils/organization';
import { getOrganizationPath } from '@etabli/src/utils/organization';
import { mapColorModes } from '@etabli/src/utils/organizations-map';
import { linkRegistry } from '@etabli/src/utils/routes/registry';
import { AggregatedQueries } from '@etabli/src/utils/trpc';

export enum ListFilter {
  ALL = 1,
  OPEN_ONLY,
  CLOSE_ONLY,
}

// The directory can be read as a list, or as a map of the organizations using the same criteria
const initiativesViews = ['list', 'map'] as const;

const directoryParsers = {
  q: parseAsString.withDefault(''),
  fnc: parseAsArrayOf(parseAsStringLiteral(FunctionalUseCaseSchema.options)).withDefault([]),
  tools: parseAsArrayOf(parseAsString).withDefault([]),
  orgs: parseAsArrayOf(parseAsString).withDefault([]),
  nc: parseAsBoolean.withDefault(false),
  view: parseAsStringLiteral(initiativesViews).withDefault('list'),
  zoom: parseAsString, // Where the map is looking at, it never changes the criteria
  hasWeb: parseAsBoolean.withDefault(false),
  hasRepo: parseAsBoolean.withDefault(false),
  httpSec: parseAsArrayOf(parseAsStringLiteral(GradeLetterSchema.options)).withDefault([]),
  tls: parseAsArrayOf(parseAsStringLiteral(GradeLetterSchema.options)).withDefault([]),
  ml: parseAsStringLiteral(LegalLinkPresenceSchema.options),
  pc: parseAsStringLiteral(LegalLinkPresenceSchema.options),
  foreign: parseAsArrayOf(parseAsInteger).withDefault([]),
  color: parseAsStringLiteral(mapColorModes).withDefault('composition'),
  sort: parseAsStringLiteral(InitiativesOrderSchema.options).withDefault('name'),
  page: parseAsInteger.withDefault(1),
};

const serializeDirectoryParams = createSerializer(directoryParsers);

const organizationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const { t } = useTranslation('common');

  const assistantPath = linkRegistry.get('assistant', undefined);

  const [params, setParams] = useQueryStates(directoryParsers, { history: 'push', clearOnDefault: true });

  // Only valid identifiers are sent to the API (the URL can be modified by hand)
  const organizationIds = useMemo(
    () => params.orgs.filter((organizationId) => organizationIdPattern.test(organizationId)).slice(0, maximumFilteredOrganizations),
    [params.orgs]
  );

  const filtersValue: InitiativeFiltersValue = useMemo(
    () => ({
      functionalUseCases: params.fnc,
      toolIds: params.tools,
      organizationIds: organizationIds,
      unclassified: params.nc,
      hasWebsite: params.hasWeb,
      hasRepository: params.hasRepo,
      httpSecurityGrades: params.httpSec,
      tlsGrades: params.tls,
      legalNotice: params.ml,
      privacyPolicy: params.pc,
      foreignDependencyLevels: params.foreign,
    }),
    [
      params.fnc,
      params.tools,
      organizationIds,
      params.nc,
      params.hasWeb,
      params.hasRepo,
      params.httpSec,
      params.tls,
      params.ml,
      params.pc,
      params.foreign,
    ]
  );

  const isMapView = params.view === 'map';

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

  const filterBy: ListInitiativesSchemaType['filterBy'] = {
    query: hasSearchQuery ? params.q : null,
    functionalUseCases: params.fnc.length > 0 ? params.fnc : undefined,
    toolIds: params.tools.length > 0 ? params.tools : undefined,
    organizationIds: organizationIds.length > 0 ? organizationIds : undefined,
    unclassified: params.nc || undefined,
    hasWebsite: params.hasWeb || undefined,
    hasRepository: params.hasRepo || undefined,
    httpSecurityGrades: params.httpSec.length > 0 ? params.httpSec : undefined,
    tlsGrades: params.tls.length > 0 ? params.tls : undefined,
    legalNotice: params.ml ?? undefined,
    privacyPolicy: params.pc ?? undefined,
    foreignDependencyLevels: params.foreign.length > 0 ? params.foreign : undefined,
  };

  const listInitiatives = trpc.listInitiatives.useQuery(
    {
      page: params.page,
      pageSize: pageSize,
      orderBy: { field: params.sort },
      filterBy: filterBy,
    },
    { enabled: !isMapView }
  );

  // To display active organization filters with a readable name
  const selectedOrganizations = trpc.getOrganizations.useQuery(
    { ids: organizationIds },
    { enabled: organizationIds.length > 0, keepPreviousData: true }
  );

  const selectedTools = trpc.listTools.useQuery(undefined, { enabled: params.tools.length > 0, keepPreviousData: true });

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
      orgs: next.organizationIds.length > 0 ? next.organizationIds : null,
      nc: next.unclassified ? true : null,
      hasWeb: next.hasWebsite ? true : null,
      hasRepo: next.hasRepository ? true : null,
      httpSec: next.httpSecurityGrades.length > 0 ? next.httpSecurityGrades : null,
      tls: next.tlsGrades.length > 0 ? next.tlsGrades : null,
      ml: next.legalNotice,
      pc: next.privacyPolicy,
      foreign: next.foreignDependencyLevels.length > 0 ? next.foreignDependencyLevels : null,
      page: 1,
    });
    setFiltersModalOpen(false);
  };

  const resetFilters = () => {
    setParams({
      fnc: null,
      tools: null,
      orgs: null,
      nc: null,
      hasWeb: null,
      hasRepo: null,
      httpSec: null,
      tls: null,
      ml: null,
      pc: null,
      foreign: null,
      page: 1,
    });
  };

  // Leaving the map for the list narrows it to where the map is looking at (virtual nodes other than the unclassified one are not a filter)
  const listViewParams = {
    view: null,
    zoom: null,
    ...(params.zoom === unclassifiedInitiativesNodeId
      ? { orgs: null, nc: true }
      : params.zoom && organizationIdPattern.test(params.zoom)
        ? { orgs: narrowOrganizationsToNode(selectedOrganizations.data?.organizations ?? [], params.zoom), nc: null }
        : {}),
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
      <Grid container sx={{ ...wideContainerGridProps.sx, px: 0, pt: 3, pb: isMapView ? 2 : 6 }} direction="column" alignContent="flex-start">
        <Grid item sx={{ width: '100%' }}>
          {/* Controls stay at the same place between views, and are kept compact so the map fits in the screen below them */}
          <Grid container sx={{ ...reusableCentering, pb: 2 }}>
            <Grid item xs={12} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 2 }}>
              <Typography component="h1" variant="h5" sx={{ mb: 0 }}>
                Annuaire des initiatives
              </Typography>
              <ToggleButtonGroup
                color="primary"
                size="small"
                value={params.view}
                exclusive
                onChange={(event, newValue) => {
                  if (newValue !== null) {
                    setParams(newValue === 'list' ? { ...listViewParams, page: 1 } : { view: newValue, page: 1 });
                    push(['trackEvent', 'directory', 'changeView', newValue]);
                  }
                }}
                aria-label="vue des initiatives"
              >
                <ToggleButton value="list" sx={{ px: 2, gap: 1 }}>
                  <ViewListIcon fontSize="small" /> Liste
                </ToggleButton>
                <ToggleButton value="map" sx={{ px: 2, gap: 1 }}>
                  <BubbleChartIcon fontSize="small" /> Carte
                </ToggleButton>
              </ToggleButtonGroup>
            </Grid>
            <Grid item xs={12}>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                <TextField
                  type="text"
                  name="search"
                  size="small"
                  placeholder="Rechercher... (que ce soit un nom, un outil, un cas d'utilisation)"
                  inputRef={queryRef}
                  defaultValue={params.q}
                  onChange={debouncedSearchChange}
                  sx={{ flex: '1 1 240px' }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        {hasSearchQuery && (
                          <IconButton aria-label="effacer la recherche" size="small" onClick={handleClearQuery}>
                            <ClearIcon fontSize="small" />
                          </IconButton>
                        )}
                      </InputAdornment>
                    ),
                  }}
                />
                {!isMapView && (
                  <TextField
                    select
                    size="small"
                    label="Trier par"
                    value={params.sort}
                    onChange={(event) => {
                      setParams({ sort: event.target.value as InitiativesOrderSchemaType, page: 1 });
                    }}
                    sx={{ flex: '0 0 150px' }}
                  >
                    <MenuItem value="name">{hasSearchQuery ? 'Pertinence' : 'Nom'}</MenuItem>
                    <MenuItem value="reputation">Notoriété</MenuItem>
                  </TextField>
                )}
                <Button
                  variant={activeFiltersCount > 0 ? 'contained' : 'outlined'}
                  color="primary"
                  startIcon={
                    <Badge color="error" badgeContent={activeFiltersCount} invisible={activeFiltersCount === 0}>
                      <FilterListIcon />
                    </Badge>
                  }
                  onClick={() => setFiltersModalOpen(true)}
                  sx={{ height: 40 }} // Same height as the search field
                >
                  Filtres
                </Button>
                {activeFiltersCount > 0 && (
                  <Button variant="text" size="small" onClick={resetFilters}>
                    Réinitialiser
                  </Button>
                )}
                {!isMapView && (
                  // The compact table is for comparing many items, it stays a secondary display of the list
                  <Tooltip title={listDisplay === ListDisplay.TABLE ? 'Affichage en cartes' : 'Affichage compact'}>
                    <IconButton
                      aria-label={listDisplay === ListDisplay.TABLE ? 'affichage en cartes' : 'affichage compact'}
                      onClick={() => {
                        const nextDisplay = listDisplay === ListDisplay.TABLE ? ListDisplay.GRID : ListDisplay.TABLE;

                        setListDisplay(nextDisplay);
                        push(['trackEvent', 'directory', 'changeDisplay', nextDisplay]);
                      }}
                    >
                      {listDisplay === ListDisplay.TABLE ? <GridViewIcon /> : <TableRowsIcon />}
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
              {!isMapView && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Vous ne trouvez pas l&apos;initiative qui correspond à votre besoin&nbsp;?{' '}
                  <Link component={NextLink} href={assistantPath} underline="none">
                    Notre assistant
                  </Link>{' '}
                  peut vous aider.
                </Typography>
              )}
            </Grid>
            {activeFiltersCount > 0 && (
              <Grid item xs={12} sx={{ mt: 1 }}>
                <Stack
                  direction="row"
                  spacing={1}
                  useFlexGap
                  flexWrap="wrap"
                  component="ul"
                  sx={{ listStyle: 'none', p: 0, m: 0 }}
                  aria-label="filtres actifs"
                >
                  {params.nc && (
                    <li>
                      <Chip label="Non classées" onDelete={() => setParams({ nc: null, page: 1 })} color="primary" variant="outlined" />
                    </li>
                  )}
                  {(organizationIds.length > 0 ? selectedOrganizations.data?.organizations || [] : []).map((organization) => {
                    return (
                      <li key={organization.id}>
                        <Tooltip
                          arrow
                          describeChild
                          title={organization.ancestors.length > 0 ? <OrganizationTree paths={[getOrganizationPath(organization)]} /> : ''} // Nothing to tell for a root
                        >
                          <Chip
                            label={organization.name}
                            onDelete={() => {
                              const remainingOrganizationIds = params.orgs.filter((organizationId) => organizationId !== organization.id);

                              setParams({ orgs: remainingOrganizationIds.length > 0 ? remainingOrganizationIds : null, page: 1 });
                            }}
                            color="primary"
                            variant="outlined"
                            sx={{ maxWidth: '100%' }}
                          />
                        </Tooltip>
                      </li>
                    );
                  })}

                  {params.fnc.map((functionalUseCase) => (
                    <li key={functionalUseCase}>
                      <Chip
                        label={t(`model.initiative.functionalUseCase.enum.${functionalUseCase}`)}
                        onDelete={() => {
                          const remaining = params.fnc.filter((item) => item !== functionalUseCase);

                          setParams({ fnc: remaining.length > 0 ? remaining : null, page: 1 });
                        }}
                        color="primary"
                        variant="outlined"
                      />
                    </li>
                  ))}
                  {params.tools.map((toolId) => {
                    const tool = selectedTools.data?.tools.find((item) => item.id === toolId);

                    return (
                      tool && (
                        <li key={toolId}>
                          <Chip
                            label={tool.name}
                            onDelete={() => {
                              const remaining = params.tools.filter((item) => item !== toolId);

                              setParams({ tools: remaining.length > 0 ? remaining : null, page: 1 });
                            }}
                            color="primary"
                            variant="outlined"
                          />
                        </li>
                      )
                    );
                  })}
                  {params.hasWeb && (
                    <li>
                      <Chip label="Avec site internet" onDelete={() => setParams({ hasWeb: null, page: 1 })} color="primary" variant="outlined" />
                    </li>
                  )}
                  {params.hasRepo && (
                    <li>
                      <Chip label="Avec dépôt de code" onDelete={() => setParams({ hasRepo: null, page: 1 })} color="primary" variant="outlined" />
                    </li>
                  )}
                  {params.httpSec.map((grade) => (
                    <li key={`httpSec-${grade}`}>
                      <Chip
                        label={`Sécurité web : ${grade}`}
                        onDelete={() => setParams({ httpSec: params.httpSec.filter((item) => item !== grade), page: 1 })}
                        color="primary"
                        variant="outlined"
                      />
                    </li>
                  ))}
                  {params.tls.map((grade) => (
                    <li key={`tls-${grade}`}>
                      <Chip
                        label={`Note TLS : ${grade}`}
                        onDelete={() => setParams({ tls: params.tls.filter((item) => item !== grade), page: 1 })}
                        color="primary"
                        variant="outlined"
                      />
                    </li>
                  ))}
                  {params.foreign.map((level) => (
                    <li key={`foreign-${level}`}>
                      <Chip
                        label={`Dépendance hors UE : ${getForeignDependencyLevelLabel(level)?.toLowerCase()}`}
                        onDelete={() => setParams({ foreign: params.foreign.filter((item) => item !== level), page: 1 })}
                        color="primary"
                        variant="outlined"
                      />
                    </li>
                  ))}
                  {params.ml && (
                    <li>
                      <Chip
                        label={`Mentions légales : lien ${params.ml === 'with' ? 'trouvé' : 'non trouvé'}`}
                        onDelete={() => setParams({ ml: null, page: 1 })}
                        color="primary"
                        variant="outlined"
                      />
                    </li>
                  )}
                  {params.pc && (
                    <li>
                      <Chip
                        label={`Confidentialité : lien ${params.pc === 'with' ? 'trouvé' : 'non trouvé'}`}
                        onDelete={() => setParams({ pc: null, page: 1 })}
                        color="primary"
                        variant="outlined"
                      />
                    </li>
                  )}
                </Stack>
              </Grid>
            )}
          </Grid>
        </Grid>
        {isMapView || !listInitiatives.isLoading ? (
          <>
            {isMapView ? (
              <Grid item sx={{ width: '100%' }}>
                <OrganizationsMap
                  filterBy={filterBy}
                  focusedNodeId={params.zoom}
                  onFocus={(nodeId) => setParams({ zoom: nodeId })}
                  colorMode={params.color}
                  onColorModeChange={(mode) => setParams({ color: mode })}
                  listHref={`${linkRegistry.get('initiatives', undefined)}${serializeDirectoryParams({ ...params, ...listViewParams, page: null })}`}
                  onShowList={() => setParams({ ...listViewParams, page: 1 })}
                />
              </Grid>
            ) : hasResults ? (
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
                    <ContextualInitiativeList initiatives={initiatives} display={listDisplay} focusedOrganizationsIds={organizationIds} />
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
