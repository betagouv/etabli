'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { keepPreviousData } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useIsomorphicLayoutEffect } from 'react-use';

import { OrganizationsMapPanel, panelWidth, widePanelMedia } from '@etabli/src/app/(public)/initiatives/OrganizationsMapPanel';
import { OrganizationsMapSurface } from '@etabli/src/app/(public)/initiatives/OrganizationsMapSurface';
import { trpc } from '@etabli/src/client/trpcClient';
import { ErrorAlert } from '@etabli/src/components/ErrorAlert';
import { LoadingArea } from '@etabli/src/components/LoadingArea';
import { ListInitiativesSchemaType } from '@etabli/src/models/actions/initiative';
import { centeredAlertContainerGridProps } from '@etabli/src/utils/grid';
import {
  MapColorMode,
  MapNode,
  MapScaleMode,
  compositionColorsSx,
  computeAnnotations,
  computeCircles,
  countInitiatives,
  findHighlightedCircles,
  getMapScaleVariable,
  layoutOrganizationsMap,
  mapColorModeOptions,
  mapScaleSteps,
  viewSize,
} from '@etabli/src/utils/organizations-map';

export interface OrganizationsMapProps {
  filterBy: ListInitiativesSchemaType['filterBy']; // Criteria of the directory
  focusedNodeId: string | null; // Only a position on the map, when unknown (e.g. no longer matching filters) the whole map is displayed
  onFocus: (nodeId: string | null) => void;
  listHref: string; // Same as `onShowList`, for browser features (e.g. open in a new tab)
  onShowList: () => void;
  colorMode: MapColorMode;
  onColorModeChange: (mode: MapColorMode) => void;
}

// Where the element starts in the page, to make it fit in the screen whatever is displayed above it
function usePageTop(element: HTMLElement | null): number | null {
  const [top, setTop] = useState<number | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (!element) {
      return;
    }

    const measure = () => setTop(Math.round(element.getBoundingClientRect().top + window.scrollY));
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(document.body);

    return () => observer.disconnect();
  }, [element]);

  return top;
}

function OrganizationsMapColorControl(props: { mode: MapColorMode; onChange: (mode: MapColorMode) => void }) {
  const option = mapColorModeOptions.find((item) => item.mode === props.mode);

  return (
    <Box
      sx={{
        position: { xs: 'relative', md: 'absolute' },
        top: { md: 16 },
        left: { md: 16 },
        zIndex: 1,
        width: { xs: 'auto', md: 220 },
        mx: { xs: 2, md: 0 },
        mb: { xs: 2, md: 0 },
      }}
    >
      <TextField
        select
        size="small"
        fullWidth
        label="Couleur des bulles"
        value={props.mode}
        onChange={(event) => props.onChange(event.target.value as MapColorMode)}
        sx={{ backgroundColor: 'var(--background-default-grey)' }}
      >
        {mapColorModeOptions.map((item) => (
          <MenuItem key={item.mode} value={item.mode}>
            {item.label}
          </MenuItem>
        ))}
      </TextField>
      {option?.legendStart && (
        <Box sx={{ mt: 1, p: 1, borderRadius: '4px', backgroundColor: 'var(--background-default-grey)' }}>
          <Box sx={{ display: 'flex', gap: '2px', height: 10 }} aria-hidden="true">
            {mapScaleSteps.map((step) => (
              <Box key={step} sx={{ flex: 1, bgcolor: `var(${getMapScaleVariable(props.mode as MapScaleMode, step)})` }} />
            ))}
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: '0.25rem' }}>
            <Typography variant="caption">{option.legendStart}</Typography>
            <Typography variant="caption">{option.legendEnd}</Typography>
          </Box>
          <Typography component="p" color="text.secondary" sx={{ mt: 1, mb: 0, fontSize: '0.6875rem', lineHeight: 1.35 }}>
            {option.description}. Les bulles grises n&apos;ont pas de valeur.
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export function OrganizationsMap(props: OrganizationsMapProps) {
  const [mapElement, setMapElement] = useState<HTMLElement | null>(null);
  const mapTop = usePageTop(mapElement);
  const { data, error, isPending, refetch, isFetching } = trpc.getOrganizationsMap.useQuery(
    { filterBy: props.filterBy },
    { placeholderData: keepPreviousData }
  );

  const root = useMemo(() => (data ? layoutOrganizationsMap(data) : null), [data]);

  const nodesById = useMemo(() => {
    const map = new Map<string, MapNode>();
    root?.each((node) => map.set(node.data.id, node));

    return map;
  }, [root]);

  const [panelOpen, setPanelOpen] = useState(true);

  // When criteria only leave a single branch, the map starts where there is something to see instead of nested circles to go through
  const startingNode = useMemo(() => {
    let node = root;
    while (node?.children?.length === 1 && node.children[0].data.type !== 'composition') {
      node = node.children[0];
    }

    return node;
  }, [root]);

  // A composition leaf is not a place to look at, it can only come from an URL modified by hand
  const requestedNode = props.focusedNodeId ? nodesById.get(props.focusedNodeId) : undefined;
  const focus = requestedNode && requestedNode.data.type !== 'composition' ? requestedNode : startingNode;
  const scale = focus ? viewSize / 2 / focus.r : 1;

  const circles = useMemo(() => (focus ? computeCircles(focus, scale, props.colorMode) : []), [focus, scale, props.colorMode]);
  const highlightedCircles = useMemo(() => findHighlightedCircles(circles, props.filterBy?.query), [circles, props.filterBy?.query]);
  const annotations = useMemo(
    () => (focus ? computeAnnotations(focus, circles, scale) : { labeledNodes: [], countedNodes: [] }),
    [circles, focus, scale]
  );

  if (isPending) {
    return <LoadingArea ariaLabelTarget="carte des organisations" />;
  } else if (error || !root) {
    return (
      <Grid container {...centeredAlertContainerGridProps}>
        <ErrorAlert errors={error ? [error] : []} refetchs={[refetch]} />
      </Grid>
    );
  }

  if (!focus) {
    return null;
  } else if (focus.data.initiativesCount === 0) {
    return (
      // Same width as the controls of the page, only the map itself goes from edge to edge
      <Box sx={{ maxWidth: 'lg', mx: 'auto', px: 3, py: 2 }}>
        <Alert severity="info">Aucune initiative ne correspond à votre recherche ou à vos filtres.</Alert>
      </Box>
    );
  }

  const zoomTo = (node: MapNode | null | undefined) => {
    if (!node) {
      return;
    }

    // A composition leaf is not a place to zoom in, its organization is
    const target = node.data.type === 'composition' ? node.parent : node;
    if (target) {
      props.onFocus(target === startingNode ? null : target.data.id);
    }
  };

  // A colored circle gathers initiatives: from its organization there is nowhere to zoom, so it opens them
  const opensList = (node: MapNode) => node.data.type === 'composition' && node.parent === focus;

  const focusParent = focus === startingNode ? null : focus.parent;
  const organizationsCount = data?.organizations.filter((organization) => countInitiatives(organization.own) > 0).length ?? 0; // Without their parents

  return (
    <Box
      ref={setMapElement}
      sx={{
        ...compositionColorsSx,
        // The map takes the rest of the screen under the page controls, panels are displayed over it
        position: 'relative',
        width: '100%',
        height: { xs: 'auto', md: mapTop !== null ? `calc(100vh - ${mapTop}px - 16px)` : '70vh' },
        minHeight: { md: 400 },
        opacity: isFetching ? 0.75 : 1,
        transition: 'opacity 150ms ease-in-out',
        overflow: 'hidden',
      }}
    >
      {/* The whole area goes back up, not only the square of the map */}
      <Box
        onClick={() => zoomTo(focusParent)}
        sx={{
          cursor: focusParent ? 'zoom-out' : 'default',
          position: { xs: 'relative', md: 'absolute' },
          inset: { md: 0 },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // Room for the side panel so the map is not hidden below it
          pr: { md: panelOpen ? `${panelWidth + 32}px` : 0 },
          [widePanelMedia]: { pr: panelOpen ? `${panelWidth * 2 + 32}px` : 0 },
          py: { xs: 2, md: 2 },
          transition: 'padding 200ms ease-in-out',
        }}
      >
        <Box
          sx={{ position: 'relative', height: { xs: 'auto', md: '100%' }, width: { xs: '100%', md: 'auto' }, aspectRatio: '1 / 1', maxWidth: '100%' }}
        >
          <OrganizationsMapSurface
            colorMode={props.colorMode}
            focus={focus}
            scale={scale}
            circles={circles}
            annotations={annotations}
            highlightedCircles={highlightedCircles}
            opensList={opensList}
            onZoom={zoomTo}
            onShowList={props.onShowList}
          />
        </Box>
      </Box>
      <OrganizationsMapColorControl mode={props.colorMode} onChange={props.onColorModeChange} />
      <OrganizationsMapPanel
        colorMode={props.colorMode}
        onColorModeChange={props.onColorModeChange}
        filterBy={props.filterBy}
        root={root}
        focus={focus}
        focusParent={focusParent}
        nodesById={nodesById}
        organizationsCount={organizationsCount}
        open={panelOpen}
        onOpenChange={setPanelOpen}
        onZoom={zoomTo}
        listHref={props.listHref}
        onShowList={props.onShowList}
      />
    </Box>
  );
}
