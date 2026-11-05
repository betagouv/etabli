'use client';

import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { HierarchyCircularNode, hierarchy, pack } from 'd3-hierarchy';
import NextLink from 'next/link';
import { MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useIsomorphicLayoutEffect } from 'react-use';

import { ToolsBreakdown } from '@etabli/src/app/(public)/initiatives/ToolsBreakdown';
import { trpc } from '@etabli/src/client/trpcClient';
import { ErrorAlert } from '@etabli/src/components/ErrorAlert';
import { LoadingArea } from '@etabli/src/components/LoadingArea';
import { lightTooltipSlotProps, lightTooltipSx } from '@etabli/src/components/OrganizationChip';
import { OrganizationTree } from '@etabli/src/components/OrganizationTree';
import { PaginationSize } from '@etabli/src/models/actions/common';
import {
  ListInitiativesSchemaType,
  allInitiativesNodeId,
  standaloneOrganizationsNodeId,
  unclassifiedInitiativesNodeId,
} from '@etabli/src/models/actions/initiative';
import {
  InitiativesCompositionSchemaType,
  InitiativesCompositionWeightsSchemaType,
  OrganizationsMapItemSchemaType,
  OrganizationsMapSchemaType,
} from '@etabli/src/models/entities/organization';
import { centeredAlertContainerGridProps } from '@etabli/src/utils/grid';
import { getShortOrganizationName } from '@etabli/src/utils/organization';
import { linkRegistry } from '@etabli/src/utils/routes/registry';

// What initiatives are made of, each kind being a categorical color (validated for color vision deficiencies on both themes)
type CompositionKind = keyof InitiativesCompositionSchemaType;

const compositionKinds: { kind: CompositionKind; label: string; variable: string }[] = [
  { kind: 'websitesOnly', label: 'Uniquement des sites internet', variable: '--organizations-map-websites' },
  { kind: 'repositoriesOnly', label: 'Uniquement des dépôts de code', variable: '--organizations-map-repositories' },
  { kind: 'both', label: 'Sites internet et dépôts de code', variable: '--organizations-map-both' },
];

// Categorical colors stepped for each theme (validated with the dataviz palette checker)
const compositionColorsSx = {
  '--organizations-map-websites': '#2a78d6',
  '--organizations-map-repositories': '#eb6834',
  '--organizations-map-both': '#1baf7a',
  '[data-fr-theme="dark"] &': {
    '--organizations-map-websites': '#3987e5',
    '--organizations-map-repositories': '#d95926',
    '--organizations-map-both': '#199e70',
  },
};

type MapNodeType = 'root' | 'group' | 'organization' | 'unclassified' | 'composition';

interface MapNodeData {
  id: string;
  type: MapNodeType;
  name: string;
  organization?: OrganizationsMapItemSchemaType;
  initiativesCount: number; // Distinct initiatives (or those directly bound for composition leaves)
  composition: InitiativesCompositionSchemaType; // Distinct initiatives of the whole subtree
  weight: number; // For composition leaves: what drives the surface (an initiative bound to N organizations gives 1/N to each)
  children: MapNodeData[];
}

type MapNode = HierarchyCircularNode<MapNodeData>;

interface MapCircle {
  node: MapNode;
  x: number;
  y: number;
  r: number;
  fill: string; // CSS variable
  fillOpacity: number;
  slices: { variable: string; share: number }[]; // Summarized organizations are drawn as a small pie, empty otherwise
  stroke: string; // CSS variable
}

const mapReadingHelp =
  "La taille des cercles dépend du nombre d'initiatives. Leurs couleurs indiquent ce qui les compose : bleu pour les sites internet, orange pour les dépôts de code, vert pour les deux. Cliquez sur un cercle pour y entrer, sur le fond pour remonter. Une teinte claire résume une organisation et ses sous-organisations.";

// With enough room the panel is doubled so its content is displayed without scrolling
const widePanelMedia = '@media (min-width:1400px)';
const panelWidth = 368;

const viewSize = 1000;
const canvasDensity = 2; // Stays sharp on high density screens
const minimumPieRadius = 3; // Below this, slices cannot be told apart so only the main color is used
const minimumExpandedRadius = 60;
const minimumVividRadius = 4;

function countInitiatives(composition: InitiativesCompositionSchemaType): number {
  return composition.websitesOnly + composition.repositoriesOnly + composition.both;
}

// What is directly bound to a node is a single circle, its colors telling what it is made of
function ownInitiativesLeaf(
  parentId: string,
  counts: InitiativesCompositionSchemaType,
  weights: InitiativesCompositionWeightsSchemaType
): MapNodeData[] {
  const initiativesCount = countInitiatives(counts);
  if (initiativesCount === 0) {
    return [];
  }

  return [
    {
      id: `${parentId}:own`,
      type: 'composition',
      name: 'Initiatives directement rattachées',
      initiativesCount: initiativesCount,
      composition: counts,
      weight: weights.websitesOnly + weights.repositoriesOnly + weights.both,
      children: [],
    },
  ];
}

function buildTree(map: OrganizationsMapSchemaType): MapNodeData {
  const nodesById = new Map<string, MapNodeData>();
  for (const organization of map.organizations) {
    nodesById.set(organization.id, {
      id: organization.id,
      type: 'organization',
      name: organization.name,
      organization: organization,
      initiativesCount: countInitiatives(organization.composition),
      composition: organization.composition,
      weight: 0,
      children: ownInitiativesLeaf(organization.id, organization.own, organization.ownWeights),
    });
  }

  const hierarchyRoots: MapNodeData[] = [];
  const standaloneOrganizations: MapNodeData[] = [];
  for (const organization of map.organizations) {
    const node = nodesById.get(organization.id) as MapNodeData;
    const parent = organization.parentId ? nodesById.get(organization.parentId) : undefined;

    if (parent) {
      parent.children.push(node);
    } else if (organization.isHierarchyRoot) {
      hierarchyRoots.push(node);
    } else if (organization.level === 1) {
      standaloneOrganizations.push(node);
    }
  }

  const standaloneGroup: MapNodeData = {
    id: standaloneOrganizationsNodeId,
    type: 'group',
    name: 'Organisations hors hiérarchie',
    initiativesCount: countInitiatives(map.standalone),
    composition: map.standalone,
    weight: 0,
    children: standaloneOrganizations,
  };

  const unclassifiedNode: MapNodeData = {
    id: unclassifiedInitiativesNodeId,
    type: 'unclassified',
    name: 'Initiatives non classées',
    initiativesCount: countInitiatives(map.unclassified),
    composition: map.unclassified,
    weight: 0,
    children: ownInitiativesLeaf(unclassifiedInitiativesNodeId, map.unclassified, map.unclassified),
  };

  return {
    id: allInitiativesNodeId,
    type: 'root',
    name: 'Toutes les initiatives',
    initiativesCount: countInitiatives(map.composition),
    composition: map.composition,
    weight: 0,
    children: [...hierarchyRoots, standaloneGroup, unclassifiedNode].filter((node) => node.children.length > 0),
  };
}

// Its initiatives are drawn in its own circle instead of a circle inside another one, until entering it
function isLeafOrganization(node: MapNode): boolean {
  return (
    (node.data.type === 'organization' || node.data.type === 'unclassified') && !node.data.children.some((child) => child.type !== 'composition')
  );
}

function formatInitiatives(count: number): string {
  return `${count.toLocaleString('fr-FR')} initiative${count > 1 ? 's' : ''}`;
}

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

function CompositionBar(props: { composition: InitiativesCompositionSchemaType; withDetails?: boolean }) {
  const total = props.composition.websitesOnly + props.composition.repositoriesOnly + props.composition.both;

  if (total === 0) {
    return null;
  }

  const bar = (
    <Box sx={{ display: 'flex', gap: '2px', height: 6, width: '100%' }} aria-hidden="true">
      {compositionKinds
        .filter(({ kind }) => props.composition[kind] > 0)
        .map(({ kind, variable }) => (
          <Box key={kind} sx={{ flexGrow: props.composition[kind], bgcolor: `var(${variable})`, borderRadius: '2px', minWidth: 2 }} />
        ))}
    </Box>
  );

  if (!props.withDetails) {
    return <Box sx={{ mt: 0.5 }}>{bar}</Box>;
  }

  return (
    <Tooltip
      title={<CompositionDetails composition={props.composition} />}
      enterTouchDelay={0}
      // Tooltips are rendered outside of the map, so the colors must be provided again
      componentsProps={{ tooltip: { sx: { ...lightTooltipSx, ...compositionColorsSx, minWidth: 280 } } }}
    >
      <Box
        tabIndex={0}
        role="img"
        aria-label={compositionKinds.map(({ kind, label }) => `${label} : ${props.composition[kind].toLocaleString('fr-FR')}`).join(', ')}
        sx={{ py: 0.5, cursor: 'help' }} // A bigger area to hover
      >
        {bar}
      </Box>
    </Tooltip>
  );
}

function CompositionDetails(props: { composition: InitiativesCompositionSchemaType }) {
  return (
    <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
      {compositionKinds.map(({ kind, label, variable }) => (
        <Box component="li" key={kind} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: `var(${variable})`, flexShrink: 0 }} aria-hidden="true" />
          <Typography variant="caption" sx={{ flex: 1 }}>
            {label}
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            {props.composition[kind].toLocaleString('fr-FR')}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

export interface OrganizationsMapProps {
  filterBy: ListInitiativesSchemaType['filterBy']; // Criteria of the directory
  focusedNodeId: string | null; // Only a position on the map, when unknown (e.g. no longer matching filters) the whole map is displayed
  onFocus: (nodeId: string | null) => void;
  listHref: string; // Same as `onShowList`, for browser features (e.g. open in a new tab)
  onShowList: () => void;
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

export function OrganizationsMap(props: OrganizationsMapProps) {
  const [mapElement, setMapElement] = useState<HTMLElement | null>(null);
  const mapTop = usePageTop(mapElement);
  const { data, error, isLoading, refetch, isFetching } = trpc.getOrganizationsMap.useQuery({ filterBy: props.filterBy }, { keepPreviousData: true });

  const root = useMemo(() => {
    if (!data) {
      return null;
    }

    const tree = hierarchy(buildTree(data), (node) => node.children)
      .sum((node) => node.weight)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    // Less padding between the thousands of standalone organizations so they do not take most of the space
    return pack<MapNodeData>()
      .size([viewSize, viewSize])
      .padding((node) => (node.data.type === 'group' ? 1 : 3))(tree);
  }, [data]);

  const nodesById = useMemo(() => {
    const map = new Map<string, MapNode>();
    root?.each((node) => map.set(node.data.id, node));

    return map;
  }, [root]);

  const [hovered, setHovered] = useState<{ node: MapNode; x: number; y: number; width: number } | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);

  // Otherwise entering an organization from the bottom of the panel would leave its details out of sight
  const panelContentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelContentRef.current?.scrollTo({ top: 0 });
  }, [props.focusedNodeId]);

  // When criteria only leave a single branch, the map starts where there is something to see instead of nested circles to go through
  const startingNode = useMemo(() => {
    let node = root;
    while (node?.children?.length === 1 && node.children[0].data.type !== 'composition') {
      node = node.children[0];
    }

    return node;
  }, [root]);

  const focus = (props.focusedNodeId && nodesById.get(props.focusedNodeId)) || startingNode;
  const scale = focus ? viewSize / 2 / focus.r : 1;

  // Only what can be seen is kept: the focused subtree a few levels deep, skipping circles too small to be noticed.
  // Parents are listed before their children, so this is also the painting order.
  const circles = useMemo(() => {
    const items: MapCircle[] = [];
    if (!focus) {
      return items;
    }

    const visit = (node: MapNode, relativeDepth: number) => {
      const radius = node.r * scale;
      if (radius < 1) {
        return;
      }

      // Going a few levels deep is enough, unless there is room to see more (e.g. with filters leaving a few long branches)
      const isLeaf = isLeafOrganization(node);
      const isExpanded =
        !isLeaf && !!node.children && (relativeDepth < 3 || radius >= minimumExpandedRadius) && node.children.some((child) => child.r * scale >= 1);

      const isComposition = node.data.type === 'composition';
      // When the content of a node is not drawn, it takes the colors of what its initiatives are made of
      // (otherwise thousands of tiny town halls would look like an empty area)
      const isSummarized = !isComposition && !isExpanded;
      let kind: (typeof compositionKinds)[number] | undefined;
      let slices: MapCircle['slices'] = [];
      if (isComposition || isSummarized) {
        const composition = node.data.composition;
        const total = countInitiatives(composition);

        kind = compositionKinds.reduce((best, item) => (composition[item.kind] > composition[best.kind] ? item : best));
        slices = compositionKinds
          .filter((item) => composition[item.kind] > 0)
          .map((item) => ({ variable: item.variable, share: composition[item.kind] / total }));
      }

      items.push({
        node: node,
        x: (node.x - focus.x) * scale + viewSize / 2,
        y: (node.y - focus.y) * scale + viewSize / 2,
        r: radius,
        fill: kind ? kind.variable : node.depth % 2 === 0 ? '--background-alt-grey' : '--background-default-grey',
        fillOpacity: isSummarized && (!isLeaf || radius < minimumVividRadius) ? 0.55 : 1, // Thousands of tiny vivid circles would be aggressive
        slices: slices,
        stroke: isComposition ? '--background-default-grey' : '--border-default-grey',
      });

      if (isExpanded) {
        node.children?.forEach((child) => visit(child, relativeDepth + 1));
      }
    };

    focus.children?.forEach((child) => visit(child, 1));

    return items;
  }, [focus, scale]);

  // There can be more than 10 000 circles at the top level: as DOM elements, going back there freezes the page for seconds
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useIsomorphicLayoutEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }

    const draw = () => {
      const styles = getComputedStyle(canvas);
      const colors = new Map<string, string>();
      const getColor = (variable: string) => {
        let color = colors.get(variable);
        if (color === undefined) {
          color = styles.getPropertyValue(variable).trim();
          colors.set(variable, color);
        }

        return color;
      };

      const paint = (
        x: number,
        y: number,
        r: number,
        fill: string,
        fillOpacity: number,
        stroke: string,
        strokeWidth: number,
        slices: MapCircle['slices'] = []
      ) => {
        context.globalAlpha = fillOpacity;
        if (slices.length > 1 && r >= minimumPieRadius) {
          let startAngle = -Math.PI / 2;
          for (const slice of slices) {
            const endAngle = startAngle + slice.share * 2 * Math.PI;

            context.beginPath();
            context.moveTo(x, y);
            context.arc(x, y, r, startAngle, endAngle);
            context.closePath();
            context.fillStyle = getColor(slice.variable);
            context.fill();
            startAngle = endAngle;
          }

          context.beginPath();
          context.arc(x, y, r, 0, 2 * Math.PI);
        } else {
          context.beginPath();
          context.arc(x, y, r, 0, 2 * Math.PI);
          context.fillStyle = getColor(fill);
          context.fill();
        }

        context.globalAlpha = 1;
        context.strokeStyle = getColor(stroke);
        context.lineWidth = strokeWidth;
        context.stroke();
      };

      context.setTransform(canvas.width / viewSize, 0, 0, canvas.height / viewSize, 0, 0);
      context.clearRect(0, 0, viewSize, viewSize);
      paint(viewSize / 2, viewSize / 2, viewSize / 2 - 1, '--background-default-grey', 1, '--border-default-grey', 1);
      for (const circle of circles) {
        paint(circle.x, circle.y, circle.r, circle.fill, circle.fillOpacity, circle.stroke, circle.r < 3 ? 0.5 : 1, circle.slices);
      }
    };

    draw();

    // A canvas does not follow CSS variables by itself when the theme changes
    const themeObserver = new MutationObserver(draw);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-fr-theme'] });

    return () => themeObserver.disconnect();
  }, [circles]);

  // Labels and counts are computed here since the component renders again on each hover
  const { labeledNodes, countedNodes } = useMemo(() => {
    const labeled: { node: MapNode; level: number }[] = [];
    if (!focus) {
      return { labeledNodes: labeled, countedNodes: [] as MapNode[] };
    }

    // Labels for the 2 next levels under the focus so the hierarchy reads at first sight (e.g. ministries in the central administration).
    // A circle wrapping a single big child (e.g. "Gouvernement" inside "Administration centrale") does not count as a level.
    const isWrapper = (node: MapNode) => !!node.parent && node.r > node.parent.r * 0.8;
    const collectLabels = (parent: MapNode, level: number) => {
      for (const child of parent.children || []) {
        if (child.data.type === 'composition' || child.r * scale < 36) {
          continue;
        }

        const childLevel = isWrapper(child) ? level : level + 1;
        if (childLevel > 2) {
          continue;
        }

        if (!isWrapper(child)) {
          labeled.push({ node: child, level: childLevel });
        }

        collectLabels(child, childLevel);
      }
    };
    collectLabels(focus, 0);

    // Counts written inside the colored bubbles directly under the focus, so their meaning is clear without hovering
    const counted = circles
      .filter(
        ({ node, r }) =>
          (node.data.type === 'composition' || isLeafOrganization(node)) &&
          node.depth <= focus.depth + 2 &&
          r >= 16 &&
          !labeled.some((item) => item.node === node && item.level === 2) // Their name is at the same place
      )
      .map(({ node }) => node);

    return { labeledNodes: labeled, countedNodes: counted };
  }, [circles, focus, scale]);

  if (isLoading) {
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

  const toScreen = (node: MapNode) => ({
    x: (node.x - focus.x) * scale + viewSize / 2,
    y: (node.y - focus.y) * scale + viewSize / 2,
    r: node.r * scale,
  });

  const zoomTo = (node: MapNode | null | undefined) => {
    if (!node) {
      return;
    }

    // A composition leaf is not a place to zoom in, its organization is
    const target = node.data.type === 'composition' ? node.parent : node;
    if (target) {
      setHovered(null);
      props.onFocus(target === startingNode ? null : target.data.id);
    }
  };

  // A colored circle gathers initiatives: from its organization there is nowhere to zoom, so it opens them
  const opensList = (node: MapNode) => node.data.type === 'composition' && node.parent === focus;

  const findNodeAt = (event: MouseEvent<SVGSVGElement>): { node: MapNode | null; bounds: DOMRect } => {
    // The map stays a centered square in its box, which is not one when space is missing
    const bounds = event.currentTarget.getBoundingClientRect();
    const size = Math.min(bounds.width, bounds.height);
    const x = ((event.clientX - bounds.left - (bounds.width - size) / 2) * viewSize) / size;
    const y = ((event.clientY - bounds.top - (bounds.height - size) / 2) * viewSize) / size;

    // From the last painted so the deepest circle is the one found
    for (let index = circles.length - 1; index >= 0; index--) {
      const circle = circles[index];
      if ((x - circle.x) ** 2 + (y - circle.y) ** 2 <= circle.r ** 2) {
        return { node: circle.node, bounds: bounds };
      }
    }

    return { node: null, bounds: bounds };
  };

  const focusParent = focus === startingNode ? null : focus.parent;
  const focusPath = focus
    .ancestors()
    .reverse()
    .slice(1) // "All initiatives" is not an organization
    .map((node) => ({ id: node.data.id, name: node.data.name, acronym: node.data.organization?.acronym ?? null }));
  const focusChildren = (focus.children || []).filter((node) => node.data.type !== 'composition');

  const focusKind: 'root' | 'group' | 'organization' | 'unclassified' = focus.data.type === 'composition' ? 'organization' : focus.data.type;
  const hasCriteria = !!props.filterBy.query || buildsOnFilters(props.filterBy);
  const organizationsCount = data?.organizations.filter((organization) => countInitiatives(organization.own) > 0).length ?? 0; // Without their parents
  const focusLinkLabel =
    focusKind === 'root' ? 'Voir toutes les initiatives' : focusKind === 'unclassified' ? 'Voir ces initiatives' : 'Voir ses initiatives';

  const hoveredParentName = hovered?.node.data.type === 'composition' ? hovered.node.parent?.data.name : hovered?.node.parent?.data.name;

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
          <canvas
            ref={canvasRef}
            width={viewSize * canvasDensity}
            height={viewSize * canvasDensity}
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
          />
          <svg
            viewBox={`0 0 ${viewSize} ${viewSize}`}
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              display: 'block',
              cursor: hovered ? 'pointer' : 'inherit',
            }}
            role="img"
            aria-label={`Carte des organisations, actuellement sur « ${focus.data.name} ». Le panneau reprend le même contenu sous forme de liste.`}
            onClick={(event) => {
              const { node } = findNodeAt(event);
              if (!node) {
                return;
              }

              event.stopPropagation();
              if (opensList(node)) {
                props.onShowList();
              } else {
                zoomTo(node);
              }
            }}
            onMouseMove={(event) => {
              const { node, bounds } = findNodeAt(event);

              setHovered(node ? { node: node, x: event.clientX - bounds.left, y: event.clientY - bounds.top, width: bounds.width } : null);
            }}
            onMouseLeave={() => setHovered(null)}
          >
            {hovered && (
              <circle
                {...(({ x, y, r }) => ({ cx: x, cy: y, r: r }))(toScreen(hovered.node))}
                fill="none"
                stroke="var(--text-action-high-blue-france)"
                strokeWidth={2}
                style={{ pointerEvents: 'none' }}
              />
            )}
            {countedNodes.map((node) => {
              const { x, y, r } = toScreen(node);

              return (
                <text
                  key={`count-${node.data.id}`}
                  x={x}
                  y={y + Math.min(36, r * 0.4) / 3}
                  textAnchor="middle"
                  fontSize={Math.min(36, r * 0.4)}
                  fontWeight={700}
                  fill="var(--text-default-grey)"
                  stroke="var(--background-default-grey)"
                  strokeWidth={3}
                  paintOrder="stroke"
                  style={{ pointerEvents: 'none' }}
                >
                  {node.data.initiativesCount.toLocaleString('fr-FR')}
                </text>
              );
            })}
            {labeledNodes.map(({ node, level }) => {
              const { x, y, r } = toScreen(node);
              const fontSize = level === 1 ? 14 : 12;
              const maximumCharacters = Math.max(6, Math.floor((r * 1.7) / (fontSize * 0.55)));
              const name = node.data.organization ? getShortOrganizationName(node.data.organization) : node.data.name;
              const label = name.length > maximumCharacters ? `${name.slice(0, maximumCharacters - 1)}…` : name;

              return (
                <text
                  key={`label-${node.data.id}`}
                  x={x}
                  // First level names are at the top of their circle so they do not hide their content, the next ones are centered
                  y={level === 1 ? y - r + Math.min(28, r * 0.25) : y + fontSize / 3}
                  textAnchor="middle"
                  fontSize={fontSize}
                  fontWeight={level === 1 ? 700 : 600}
                  fill="var(--text-default-grey)"
                  stroke="var(--background-default-grey)"
                  strokeWidth={4}
                  paintOrder="stroke"
                  style={{ pointerEvents: 'none' }}
                >
                  {label}
                </text>
              );
            })}
          </svg>
          {hovered && (
            <Box
              role="tooltip"
              sx={{
                position: 'absolute',
                left: hovered.x,
                top: hovered.y,
                transform: `translate(${hovered.x > hovered.width / 2 ? 'calc(-100% - 16px)' : '16px'}, 16px)`,
                pointerEvents: 'none',
                bgcolor: 'var(--background-default-grey)',
                border: '1px solid var(--border-default-grey)',
                boxShadow: 3,
                borderRadius: '4px',
                p: '12px 16px',
                width: 300,
                zIndex: 3,
              }}
            >
              {hoveredParentName && hovered.node.depth > 1 && (
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.25 }}>
                  {hoveredParentName}
                </Typography>
              )}
              {hovered.node.data.type === 'composition' ? (
                <>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {formatInitiatives(hovered.node.data.initiativesCount)} directement rattachée{hovered.node.data.initiativesCount > 1 ? 's' : ''}
                  </Typography>
                  <CompositionBar composition={hovered.node.data.composition} />
                  <Box sx={{ mt: 1 }}>
                    <CompositionDetails composition={hovered.node.data.composition} />
                  </Box>
                  {opensList(hovered.node) && (
                    <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                      Cliquez pour voir la liste
                    </Typography>
                  )}
                </>
              ) : (
                <>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {hovered.node.data.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" component="div">
                    {formatInitiatives(hovered.node.data.initiativesCount)}
                  </Typography>
                  <CompositionBar composition={hovered.node.data.composition} />
                  <Box sx={{ mt: 1 }}>
                    <CompositionDetails composition={hovered.node.data.composition} />
                  </Box>
                </>
              )}
            </Box>
          )}
        </Box>
      </Box>
      <Box
        component="section"
        aria-label="détails de l'organisation sélectionnée"
        sx={{
          position: { xs: 'relative', md: 'absolute' },
          top: { md: 16 },
          right: { md: 16 },
          bottom: { md: panelOpen ? 16 : 'auto' },
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
            borderBottom: panelOpen ? '1px solid var(--border-default-grey)' : 'none',
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
            onClick={() => setPanelOpen(!panelOpen)}
            aria-expanded={panelOpen}
            aria-label={panelOpen ? 'Replier le panneau' : 'Déplier le panneau'}
            sx={{ display: { xs: 'none', md: 'inline-flex' } }}
          >
            {panelOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </Box>
        {panelOpen && (
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
                <Box
                  component="nav"
                  aria-label="position dans l'arbre des organisations"
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}
                >
                  {focusParent ? (
                    <Link
                      component="button"
                      variant="caption"
                      underline="hover"
                      onClick={() => zoomTo(focusParent)}
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
                      componentsProps={lightTooltipSlotProps}
                      enterTouchDelay={0}
                      title={
                        <OrganizationTree
                          paths={[focusPath]}
                          onSelect={(nodeId) => {
                            if (nodeId !== focus.data.id) {
                              zoomTo(nodesById.get(nodeId));
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
              <CompositionBar composition={focus.data.composition} withDetails />
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
              {props.filterBy.query && focusKind !== 'group' && (
                <BestResults
                  filterBy={{
                    ...props.filterBy,
                    organizationIds: focusKind === 'organization' ? [focus.data.id] : props.filterBy.organizationIds,
                    unclassified: focusKind === 'unclassified' ? true : props.filterBy.unclassified,
                  }}
                />
              )}
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
                  {focusChildren.length > 1 ? 's' : ''} {focusKind === 'root' ? '' : 'rattachée'}
                  {focusKind !== 'root' && focusChildren.length > 1 ? 's' : ''}
                </Typography>
                <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
                  {focusChildren.slice(0, 200).map((node) => (
                    <Box component="li" key={node.data.id} sx={{ py: 0.75, borderBottom: '1px solid var(--border-default-grey)' }}>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
                        <Link component="button" variant="body2" underline="hover" onClick={() => zoomTo(node)} sx={{ textAlign: 'left', flex: 1 }}>
                          {node.data.name}
                        </Link>
                        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                          {node.data.initiativesCount.toLocaleString('fr-FR')}
                        </Typography>
                      </Box>
                      <CompositionBar composition={node.data.composition} withDetails />
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
    </Box>
  );
}
