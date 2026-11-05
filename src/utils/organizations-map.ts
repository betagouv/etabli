import { HierarchyCircularNode, hierarchy, packEnclose, packSiblings } from 'd3-hierarchy';

import { allInitiativesNodeId, standaloneOrganizationsNodeId, unclassifiedInitiativesNodeId } from '@etabli/src/models/actions/initiative';
import {
  InitiativesCompositionSchemaType,
  InitiativesCompositionWeightsSchemaType,
  InitiativesDistributionSchemaType,
  OrganizationsMapItemSchemaType,
  OrganizationsMapSchemaType,
} from '@etabli/src/models/entities/organization';
import { maximumForeignDependencyLevel } from '@etabli/src/utils/foreign-dependencies';

// What initiatives are made of, each kind being a categorical color (validated for color vision deficiencies on both themes)
export type CompositionKind = keyof InitiativesCompositionSchemaType;

export const compositionKinds: { kind: CompositionKind; label: string; variable: string }[] = [
  { kind: 'websitesOnly', label: 'Uniquement des sites internet', variable: '--organizations-map-websites' },
  { kind: 'repositoriesOnly', label: 'Uniquement des dépôts de code', variable: '--organizations-map-repositories' },
  { kind: 'both', label: 'Sites internet et dépôts de code', variable: '--organizations-map-both' },
];

// Categorical colors stepped for each theme (validated with the dataviz palette checker). Their hues (violet, magenta, olive) are none of the
// indicator scales (blue, orange, green) so the composition is not taken for a reputation, a dependency or a legal notice level
export const compositionColorsSx = {
  '--organizations-map-websites': '#6250d6',
  '--organizations-map-repositories': '#c94c84',
  '--organizations-map-both': '#8f7a00',
  '--organizations-map-reputation-1': '#dbe8f8',
  '--organizations-map-reputation-2': '#a9c9ef',
  '--organizations-map-reputation-3': '#6ea3e3',
  '--organizations-map-reputation-4': '#2f73cc',
  '--organizations-map-reputation-5': '#123f80',
  '--organizations-map-foreign-1': '#fbe6d8',
  '--organizations-map-foreign-2': '#f6c4a4',
  '--organizations-map-foreign-3': '#ee9663',
  '--organizations-map-foreign-4': '#d4632a',
  '--organizations-map-foreign-5': '#8f3a10',
  '--organizations-map-legal-1': '#dcf1e6',
  '--organizations-map-legal-2': '#a9dcc1',
  '--organizations-map-legal-3': '#6cc095',
  '--organizations-map-legal-4': '#2f9a68',
  '--organizations-map-legal-5': '#126b44',
  '--organizations-map-none': '#e5e5e5',
  '[data-fr-theme="dark"] &': {
    '--organizations-map-reputation-1': '#203247',
    '--organizations-map-reputation-2': '#24486f',
    '--organizations-map-reputation-3': '#2a66a8',
    '--organizations-map-reputation-4': '#3487e0',
    '--organizations-map-reputation-5': '#5aa9ff',
    '--organizations-map-foreign-1': '#3a2418',
    '--organizations-map-foreign-2': '#6a3415',
    '--organizations-map-foreign-3': '#a14a17',
    '--organizations-map-foreign-4': '#dd6a22',
    '--organizations-map-foreign-5': '#ff8a3d',
    '--organizations-map-legal-1': '#1d3329',
    '--organizations-map-legal-2': '#1f4f39',
    '--organizations-map-legal-3': '#22724f',
    '--organizations-map-legal-4': '#2a9b6a',
    '--organizations-map-legal-5': '#4fc68d',
    '--organizations-map-none': '#3a3a3a',
    '--organizations-map-websites': '#9085e9',
    '--organizations-map-repositories': '#d55181',
    '--organizations-map-both': '#a8921a',
  },
};

// How circles are colored. The two last ones are a magnitude so they use a single hue, from light to dark
export const mapColorModes = ['composition', 'reputation', 'foreign', 'legal'] as const;
export type MapColorMode = (typeof mapColorModes)[number];

export const mapScaleSteps = [1, 2, 3, 4, 5] as const;

export const mapColorModeOptions: { mode: MapColorMode; label: string; legendStart?: string; legendEnd?: string; description?: string }[] = [
  { mode: 'composition', label: 'Sites et dépôts' },
  {
    mode: 'reputation',
    label: 'Notoriété',
    legendStart: 'Faible',
    legendEnd: 'Forte',
    description: 'Notoriété médiane des initiatives de chaque organisation',
  },
  {
    mode: 'foreign',
    label: 'Dépendance hors UE',
    legendStart: 'Aucune',
    legendEnd: 'Forte',
    description: "Dépendance moyenne des initiatives de chaque organisation, selon ce qui se voit de l'extérieur de leurs sites",
  },
  {
    mode: 'legal',
    label: 'Mentions légales',
    legendStart: 'Aucune',
    legendEnd: 'Toutes',
    description:
      "Part des initiatives de chaque organisation dont la page d'accueil contient un lien vers leurs mentions légales, sans vérifier leur contenu",
  },
];

export type MapScaleMode = Exclude<MapColorMode, 'composition'>;

export function getMapScaleVariable(mode: MapScaleMode, step: number | null): string {
  return step === null ? '--organizations-map-none' : `--organizations-map-${mode}-${step}`;
}

// A level of dependency is one of 4 values spread over the scale, so the third step is never used by initiatives.
// From the lowest to the highest, as the legend of the selector
export const mapScaleLabels: Record<MapScaleMode, Map<number, string>> = {
  reputation: new Map([
    [1, '0 à 20 %'],
    [2, '20 à 40 %'],
    [3, '40 à 60 %'],
    [4, '60 à 80 %'],
    [5, '80 à 100 %'],
  ]),
  foreign: new Map([
    [1, 'Aucune détectée'],
    [2, 'Faible'],
    [4, 'Moyenne'],
    [5, 'Forte'],
  ]),
  legal: new Map([
    [1, 'Lien non trouvé'],
    [5, 'Lien trouvé'],
  ]),
};

// Null when the organization has no value, it stays neutral instead of looking like a low one
export function getMapScaleStep(organization: OrganizationsMapItemSchemaType | undefined, mode: MapColorMode): number | null {
  const share =
    mode === 'reputation'
      ? organization?.relativeReputation ?? null
      : mode === 'legal'
        ? organization?.legalNoticeShare ?? null
        : mode === 'foreign' && typeof organization?.averageForeignDependencyLevel === 'number'
          ? (organization.averageForeignDependencyLevel / maximumForeignDependencyLevel) * 100
          : null;

  return share === null ? null : Math.min(Math.max(Math.ceil(share / 20), 1), mapScaleSteps.length);
}

export type MapNodeType = 'root' | 'group' | 'organization' | 'unclassified' | 'composition';

export interface MapNodeData {
  id: string;
  type: MapNodeType;
  name: string;
  organization?: OrganizationsMapItemSchemaType;
  distribution: InitiativesDistributionSchemaType; // Those of the organization around for composition leaves
  initiativesCount: number; // Distinct initiatives (or those directly bound for composition leaves)
  composition: InitiativesCompositionSchemaType; // Distinct initiatives of the whole subtree
  weight: number; // For composition leaves: what drives the surface (an initiative bound to N organizations gives 1/N to each)
  children: MapNodeData[];
}

export type MapNode = HierarchyCircularNode<MapNodeData>;

export interface MapCircle {
  node: MapNode;
  x: number;
  y: number;
  r: number;
  fill: string; // CSS variable
  fillOpacity: number;
  slices: { variable: string; share: number }[]; // Summarized organizations are drawn as a small pie, empty otherwise
  stroke: string; // CSS variable
}

export const viewSize = 1000;
export const minimumPieRadius = 3; // Below this, slices cannot be told apart so only the main color is used
const minimumExpandedRadius = 60;
const minimumVividRadius = 4;

export function countInitiatives(composition: InitiativesCompositionSchemaType): number {
  return composition.websitesOnly + composition.repositoriesOnly + composition.both;
}

// What is directly bound to a node is a single circle, its colors telling what it is made of
function ownInitiativesLeaf(
  parentId: string,
  counts: InitiativesCompositionSchemaType,
  weights: InitiativesCompositionWeightsSchemaType,
  distribution: InitiativesDistributionSchemaType
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
      distribution: distribution,
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
      distribution: organization.distribution,
      initiativesCount: countInitiatives(organization.composition),
      composition: organization.composition,
      weight: 0,
      children: ownInitiativesLeaf(organization.id, organization.own, organization.ownWeights, organization.distribution),
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
    distribution: map.standaloneDistribution,
    initiativesCount: countInitiatives(map.standalone),
    composition: map.standalone,
    weight: 0,
    children: standaloneOrganizations,
  };

  const unclassifiedNode: MapNodeData = {
    id: unclassifiedInitiativesNodeId,
    type: 'unclassified',
    name: 'Initiatives non classées',
    distribution: map.unclassifiedDistribution,
    initiativesCount: countInitiatives(map.unclassified),
    composition: map.unclassified,
    weight: 0,
    children: ownInitiativesLeaf(unclassifiedInitiativesNodeId, map.unclassified, map.unclassified, map.unclassifiedDistribution),
  };

  return {
    id: allInitiativesNodeId,
    type: 'root',
    name: 'Toutes les initiatives',
    distribution: map.distribution,
    initiativesCount: countInitiatives(map.composition),
    composition: map.composition,
    weight: 0,
    children: [...hierarchyRoots, standaloneGroup, unclassifiedNode].filter((node) => node.children.length > 0),
  };
}

// Its initiatives are drawn in its own circle instead of a circle inside another one, until entering it
export function isLeafOrganization(node: MapNode): boolean {
  return (
    (node.data.type === 'organization' || node.data.type === 'unclassified') && !node.data.children.some((child) => child.type !== 'composition')
  );
}

export function formatInitiatives(count: number): string {
  return `${count.toLocaleString('fr-FR')} initiative${count > 1 ? 's' : ''}`;
}

// Space left around a circle, relative to its size so it remains visible at all scales
const siblingsSpacing = 0.97;

function layoutNode(node: MapNode, x: number, y: number, r: number): void {
  node.x = x;
  node.y = y;
  node.r = r;

  if (!node.children) {
    return;
  }

  // Each level is laid out on its own with a surface proportional to the initiatives. Laying out the whole tree at once from its
  // leaves does not allow comparing circles: empty space between thousands of tiny circles adds up over levels, so an
  // organization made of them would look several times bigger than another having as many initiatives in a few big circles
  const circles = node.children.map((child) => ({ node: child, x: 0, y: 0, r: Math.sqrt(child.value ?? 0) }));
  packSiblings(circles);

  const enclosingCircle = packEnclose(circles);
  const scale = enclosingCircle.r > 0 ? r / enclosingCircle.r : 0;

  for (const circle of circles) {
    layoutNode(
      circle.node,
      x + (circle.x - enclosingCircle.x) * scale,
      y + (circle.y - enclosingCircle.y) * scale,
      circle.r * scale * siblingsSpacing
    );
  }
}

export function layoutOrganizationsMap(map: OrganizationsMapSchemaType): MapNode {
  const tree = hierarchy(buildTree(map), (node) => node.children)
    .sum((node) => node.weight)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0)) as MapNode;

  layoutNode(tree, viewSize / 2, viewSize / 2, viewSize / 2);

  return tree;
}

export function toScreen(node: MapNode, focus: MapNode, scale: number) {
  return {
    x: (node.x - focus.x) * scale + viewSize / 2,
    y: (node.y - focus.y) * scale + viewSize / 2,
    r: node.r * scale,
  };
}

// Only what can be seen is kept: the focused subtree a few levels deep, skipping circles too small to be noticed.
// Parents are listed before their children, so this is also the painting order.
export function computeCircles(focus: MapNode, scale: number, colorMode: MapColorMode = 'composition'): MapCircle[] {
  const items: MapCircle[] = [];

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
    let scaleFill: string | undefined;
    if ((isComposition || isSummarized) && colorMode !== 'composition') {
      // A colored leaf belongs to the organization around it
      const step = getMapScaleStep((isComposition ? node.parent : node)?.data.organization, colorMode);

      scaleFill = getMapScaleVariable(colorMode, step);
    } else if (isComposition || isSummarized) {
      const composition = node.data.composition;
      const total = countInitiatives(composition);

      kind = compositionKinds.reduce((best, item) => (composition[item.kind] > composition[best.kind] ? item : best));
      slices = compositionKinds
        .filter((item) => composition[item.kind] > 0)
        .map((item) => ({ variable: item.variable, share: composition[item.kind] / total }));
    }

    const { x, y } = toScreen(node, focus, scale);

    items.push({
      node: node,
      x: x,
      y: y,
      r: radius,
      fill: scaleFill ?? kind?.variable ?? (node.depth % 2 === 0 ? '--background-alt-grey' : '--background-default-grey'),
      fillOpacity: !scaleFill && isSummarized && (!isLeaf || radius < minimumVividRadius) ? 0.55 : 1, // Thousands of tiny vivid circles would be aggressive
      slices: slices,
      stroke: isComposition ? '--background-default-grey' : '--border-default-grey',
    });

    if (isExpanded) {
      node.children?.forEach((child) => visit(child, relativeDepth + 1));
    }
  };

  focus.children?.forEach((child) => visit(child, 1));

  return items;
}

export interface MapAnnotations {
  labeledNodes: { node: MapNode; level: number }[];
  countedNodes: MapNode[];
}

// A circle nearly as big as its parent (e.g. "Gouvernement" inside "Administration centrale") does not make a visible level
function isWrapper(node: MapNode): boolean {
  return !!node.parent && node.r > node.parent.r * 0.8;
}

// How many visible levels under the focus, a wrapping circle being at the level of its parent (null when not under the focus)
export function getVisibleLevelUnder(node: MapNode, focus: MapNode): number | null {
  let level = 0;
  let current: MapNode | null = node;

  while (current && current !== focus) {
    if (!isWrapper(current)) {
      level++;
    }

    current = current.parent;
  }

  return current === focus ? level : null;
}

export function computeAnnotations(focus: MapNode, circles: MapCircle[], scale: number): MapAnnotations {
  const labeled: MapAnnotations['labeledNodes'] = [];

  // Labels for the 2 next levels under the focus so the hierarchy reads at first sight (e.g. ministries in the central administration).
  // A circle wrapping a single big child (e.g. "Gouvernement" inside "Administration centrale") does not count as a level.
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
}

const maximumHighlightedOrganizations = 12;

function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// Organizations whose name (or acronym) contains the searched words stand out on the map: a circle nearly as big as its parent
// (e.g. the DINUM in its ministry) has otherwise no visible label. Only the largest ones are kept so a generic word does not cover the map
export function findHighlightedCircles(circles: MapCircle[], query: string | null | undefined): MapCircle[] {
  const words = normalizeForSearch(query ?? '')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 2);

  if (words.length === 0) {
    return [];
  }

  const matchesWord = (text: string, word: string) => new RegExp(`(^|[^a-z0-9])${word}([^a-z0-9]|$)`).test(text);

  return circles
    .filter(({ node, r }) => {
      if (node.data.type !== 'organization' || r < minimumPieRadius) {
        return false;
      }

      const searchable = normalizeForSearch(`${node.data.name} ${node.data.organization?.acronym ?? ''}`);

      return words.every((word) => matchesWord(searchable, word));
    })
    .sort((a, b) => b.r - a.r)
    .slice(0, maximumHighlightedOrganizations);
}
