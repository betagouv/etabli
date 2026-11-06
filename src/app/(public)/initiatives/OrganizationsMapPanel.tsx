'use client';

import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { MouseEvent, useEffect, useRef } from 'react';

import { MapNodeBreakdown } from '@etabli/src/app/(public)/initiatives/OrganizationsMapComposition';
import { ToolsBreakdown } from '@etabli/src/app/(public)/initiatives/ToolsBreakdown';
import { trpc } from '@etabli/src/client/trpcClient';
import { OrganizationTree } from '@etabli/src/components/OrganizationTree';
import { PaginationSize } from '@etabli/src/models/actions/common';
import { ListInitiativesSchemaType } from '@etabli/src/models/actions/initiative';
import { narrowOrganizationsToNode } from '@etabli/src/utils/organization';
import { MapColorMode, MapNode, MapNodeType, formatInitiatives } from '@etabli/src/utils/organizations-map';
import { linkRegistry } from '@etabli/src/utils/routes/registry';

const mapReadingHelp =
  "La taille des cercles dépend du nombre d'initiatives. Leurs couleurs indiquent ce qui les compose : bleu pour les sites internet, orange pour les dépôts de code, vert pour les deux. Cliquez sur un cercle pour y entrer, sur le fond pour remonter. Une teinte claire résume une organisation et ses sous-organisations.";

// With enough room the panel is doubled so its content is displayed without scrolling
export const widePanelMedia = '@media (min-width:1400px)';
export const panelWidth = 368;

function formatResults(count: number): string {
  return `${count.toLocaleString('fr-FR')}\u00a0résultat${count > 1 ? 's' : ''}`;
}

function buildsOnFilters(filterBy: ListInitiativesSchemaType['filterBy']): boolean {
  return (
    (filterBy.functionalUseCases?.length ?? 0) > 0 ||
    (filterBy.toolIds?.length ?? 0) > 0 ||
    (filterBy.organizationIds?.length ?? 0) > 0 ||
    !!filterBy.unclassified ||
    !!filterBy.hasWebsite ||
    !!filterBy.hasRepository
  );
}

// The size of circles tells where results are, not which ones are the best: the most relevant ones are listed here
function BestResults(props: { filterBy: ListInitiativesSchemaType['filterBy'] }) {
  const maximumResults = 5;
  const { data } = trpc.listInitiatives.useQuery(
    { page: 1, pageSize: PaginationSize.size10, orderBy: {}, filterBy: props.filterBy },
    { keepPreviousData: true }
  );

  if (!data || data.initiatives.length === 0) {
    return null;
  }

  return (
    <Box sx={{ mt: 3 }}>
      <Typography component="h4" variant="subtitle2" sx={{ mb: 0.5 }}>
        Meilleurs résultats
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {data.initiatives.slice(0, maximumResults).map((initiative) => (
          <Box component="li" key={initiative.id} sx={{ py: 0.25 }}>
            <Link component={NextLink} href={linkRegistry.get('initiative', { initiativeId: initiative.id })} variant="body2" underline="hover">
              {initiative.name}
            </Link>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export interface OrganizationsMapPanelProps {
  colorMode?: MapColorMode;
  filterBy: ListInitiativesSchemaType['filterBy'];
  root: MapNode;
  focus: MapNode;
  focusParent: MapNode | null | undefined; // Where going back up leads, none when the map starts at the focus
  nodesById: Map<string, MapNode>;
  organizationsCount: number; // Having initiatives directly bound
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onZoom: (node: MapNode | null | undefined) => void;
  listHref: string;
  onShowList: () => void;
}

export function OrganizationsMapPanel(props: OrganizationsMapPanelProps) {
  const { focus, focusParent, nodesById, organizationsCount, root } = props;

  // Otherwise entering an organization from the bottom of the panel would leave its details out of sight
  const panelContentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelContentRef.current?.scrollTo({ top: 0 });
  }, [focus.data.id]);

  const focusPath = focus
    .ancestors()
    .reverse()
    .slice(1) // "All initiatives" is not an organization
    .map((node) => ({ id: node.data.id, name: node.data.name, acronym: node.data.organization?.acronym ?? null }));
  const focusChildren = (focus.children || []).filter((node) => node.data.type !== 'composition');
  const isTerritory = focusChildren.some((node) => node.data.organization?.isTerritorial); // Being located here does not mean being attached to it

  const focusKind = focus.data.type as Exclude<MapNodeType, 'composition'>; // A composition leaf is never focused
  const hasCriteria = !!props.filterBy.query || buildsOnFilters(props.filterBy);
  const focusLinkLabel =
    focusKind === 'root' ? 'Voir toutes les initiatives' : focusKind === 'unclassified' ? 'Voir ces initiatives' : 'Voir ses initiatives';

  // Same scope as the list opened from this panel, it must not go wider than the filters
  let bestResultsFilterBy = props.filterBy;
  if (focusKind === 'unclassified') {
    bestResultsFilterBy = { ...props.filterBy, organizationIds: undefined, unclassified: true };
  } else if (focusKind === 'organization') {
    const filteredOrganizations = (props.filterBy.organizationIds ?? []).flatMap((organizationId) => {
      const node = nodesById.get(organizationId);

      return node ? [{ id: organizationId, ancestors: node.ancestors().map((ancestor) => ({ id: ancestor.data.id })) }] : [];
    });

    bestResultsFilterBy = {
      ...props.filterBy,
      organizationIds: narrowOrganizationsToNode(filteredOrganizations, focus.data.id),
      unclassified: undefined,
    };
  }

  return (
    <Box
      component="section"
      aria-label="détails de l'organisation sélectionnée"
      sx={{
        position: { xs: 'relative', md: 'absolute' },
        top: { md: 16 },
        right: { md: 16 },
        bottom: { md: props.open ? 16 : 'auto' },
        width: { xs: 'auto', md: panelWidth },
        [widePanelMedia]: { width: panelWidth * 2 },
        mx: { xs: 2, md: 0 },
        mb: { xs: 2, md: 0 },
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'var(--background-default-grey)',
        border: '1px solid var(--border-default-grey)',
        borderRadius: '4px',
        boxShadow: 2,
        zIndex: 2,
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1,
          p: '12px 16px',
          borderBottom: props.open ? '1px solid var(--border-default-grey)' : 'none',
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h2" variant="h6" sx={{ mb: 0, display: 'inline', verticalAlign: 'middle' }}>
            {hasCriteria
              ? `${formatResults(root.data.initiativesCount)} dans ${organizationsCount.toLocaleString('fr-FR')} organisation${
                  organizationsCount > 1 ? 's' : ''
                }`
              : 'Organisations'}
          </Typography>
          <Tooltip title={mapReadingHelp} enterTouchDelay={0}>
            <IconButton size="small" aria-label={`Comment lire la carte : ${mapReadingHelp}`} sx={{ ml: 0.5 }}>
              <InfoOutlinedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
        <IconButton
          size="small"
          onClick={() => props.onOpenChange(!props.open)}
          aria-expanded={props.open}
          aria-label={props.open ? 'Replier le panneau' : 'Déplier le panneau'}
          sx={{ display: { xs: 'none', md: 'inline-flex' } }}
        >
          {props.open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Box>
      {props.open && (
        <Box
          ref={panelContentRef}
          sx={{
            p: '12px 16px',
            overflowY: 'auto',
            flex: 1,
            minHeight: 0,
            [widePanelMedia]: {
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              gridTemplateRows: 'auto minmax(0, 1fr)',
              gridTemplateAreas: '"details tools" "children tools"',
              columnGap: 3,
              overflowY: 'hidden',
            },
          }}
        >
          <Box sx={{ gridArea: 'details', minWidth: 0 }}>
            {focusPath.length > 0 && (
              <Box component="nav" aria-label="position dans l'arbre des organisations" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                {focusParent ? (
                  <Link
                    component="button"
                    variant="caption"
                    underline="hover"
                    onClick={() => props.onZoom(focusParent)}
                    title={focusParent.data.name}
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.25, minWidth: 0 }}
                  >
                    <ChevronLeftIcon sx={{ fontSize: 16, flexShrink: 0 }} aria-hidden="true" />
                    <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {focusParent.data.name}
                    </Box>
                  </Link>
                ) : (
                  // The map starts here since criteria leave nothing above, so its parent is only a landmark
                  focus.parent &&
                  focus.parent !== root && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      title={focus.parent.data.name}
                      sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {focus.parent.data.name}
                    </Typography>
                  )
                )}
                {focusPath.length > 1 && (
                  <Tooltip
                    arrow
                    enterTouchDelay={0}
                    title={
                      <OrganizationTree
                        paths={[focusPath]}
                        onSelect={(nodeId) => {
                          if (nodeId !== focus.data.id) {
                            props.onZoom(nodesById.get(nodeId));
                          }
                        }}
                      />
                    }
                  >
                    <IconButton size="small" aria-label={`Chemin complet : ${focusPath.map((item) => item.name).join(', ')}`} sx={{ my: '-4px' }}>
                      <AccountTreeOutlinedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            )}
            <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700, mb: 0 }}>
              {focus.data.name}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {formatInitiatives(focus.data.initiativesCount)}
            </Typography>
            <MapNodeBreakdown node={focus.data} colorMode={props.colorMode ?? 'composition'} withDetails />
            {focusKind !== 'group' && (
              <Button
                component={NextLink}
                href={props.listHref}
                variant="contained"
                size="small"
                onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                  // Staying in the page keeps it instant, the link only matters when opening elsewhere
                  if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                    event.preventDefault();
                    props.onShowList();
                  }
                }}
                sx={{ mt: 2 }}
              >
                {focusLinkLabel}
              </Button>
            )}
            {props.filterBy.query && focusKind !== 'group' && <BestResults filterBy={bestResultsFilterBy} />}
          </Box>
          <Box
            sx={{ gridArea: 'tools', minWidth: 0, minHeight: 0, [widePanelMedia]: { overflowY: 'auto', pr: 1.5, '& > :first-of-type': { mt: 0 } } }}
          >
            <ToolsBreakdown nodeId={focus.data.id} filterBy={props.filterBy} />
          </Box>
          {focusChildren.length > 0 && (
            <Box key={focus.data.id} sx={{ gridArea: 'children', minWidth: 0, minHeight: 0, [widePanelMedia]: { overflowY: 'auto', pr: 1.5 } }}>
              <Typography component="h3" variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
                {focusChildren.length.toLocaleString('fr-FR')} {focusKind === 'root' ? 'ensemble' : 'organisation'}
                {focusChildren.length > 1 ? 's' : ''} {focusKind === 'root' ? '' : isTerritory ? 'sur ce territoire' : 'rattachée'}
                {focusKind !== 'root' && !isTerritory && focusChildren.length > 1 ? 's' : ''}
              </Typography>
              <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
                {focusChildren.slice(0, 200).map((node) => (
                  <Box component="li" key={node.data.id} sx={{ py: 0.75, borderBottom: '1px solid var(--border-default-grey)' }}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
                      <Link
                        component="button"
                        variant="body2"
                        underline="hover"
                        onClick={() => props.onZoom(node)}
                        sx={{ textAlign: 'left', flex: 1 }}
                      >
                        {node.data.name}
                      </Link>
                      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                        {node.data.initiativesCount.toLocaleString('fr-FR')}
                      </Typography>
                    </Box>
                    <MapNodeBreakdown node={node.data} colorMode={props.colorMode ?? 'composition'} withDetails />
                  </Box>
                ))}
              </Box>
              {focusChildren.length > 200 && (
                <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
                  Seules les 200 plus importantes sont listées, utilisez les filtres de l&apos;annuaire pour les autres.
                </Typography>
              )}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
