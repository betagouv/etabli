'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { MouseEvent, memo, useState } from 'react';

import { OrganizationsMapCanvas } from '@etabli/src/app/(public)/initiatives/OrganizationsMapCanvas';
import { MapNodeBreakdown } from '@etabli/src/app/(public)/initiatives/OrganizationsMapComposition';
import { getShortOrganizationName } from '@etabli/src/utils/organization';
import { MapAnnotations, MapCircle, MapColorMode, MapNode, formatInitiatives, toScreen, viewSize } from '@etabli/src/utils/organizations-map';

// Kept apart since there can be many of them whereas they do not change when moving the mouse
const OrganizationsMapAnnotations = memo(function OrganizationsMapAnnotations(props: { focus: MapNode; scale: number; annotations: MapAnnotations }) {
  return (
    <>
      {props.annotations.countedNodes.map((node) => {
        const { x, y, r } = toScreen(node, props.focus, props.scale);

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
      {props.annotations.labeledNodes.map(({ node, level }) => {
        const { x, y, r } = toScreen(node, props.focus, props.scale);
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
    </>
  );
});

export interface OrganizationsMapSurfaceProps {
  colorMode?: MapColorMode;
  focus: MapNode;
  scale: number;
  circles: MapCircle[];
  annotations: MapAnnotations;
  opensList: (node: MapNode) => boolean;
  onZoom: (node: MapNode) => void;
  onShowList: () => void;
}

// The hovered node stays in this component: it changes each time the mouse moves, and it must not render the side panel again
export function OrganizationsMapSurface(props: OrganizationsMapSurfaceProps) {
  const { circles, focus } = props;
  const [hovered, setHovered] = useState<{ node: MapNode; x: number; y: number; width: number } | null>(null);

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

  const hoveredParentName = hovered?.node.parent?.data.name;

  return (
    <>
      <OrganizationsMapCanvas circles={circles} />
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
          setHovered(null);
          if (props.opensList(node)) {
            props.onShowList();
          } else {
            props.onZoom(node);
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
            {...(({ x, y, r }) => ({ cx: x, cy: y, r: r }))(toScreen(hovered.node, focus, props.scale))}
            fill="none"
            stroke="var(--text-action-high-blue-france)"
            strokeWidth={2}
            style={{ pointerEvents: 'none' }}
          />
        )}
        <OrganizationsMapAnnotations focus={focus} scale={props.scale} annotations={props.annotations} />
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
              <MapNodeBreakdown node={hovered.node.data} colorMode={props.colorMode ?? 'composition'} alwaysDetailed />
              {props.opensList(hovered.node) && (
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
              <MapNodeBreakdown node={hovered.node.data} colorMode={props.colorMode ?? 'composition'} alwaysDetailed />
            </>
          )}
        </Box>
      )}
    </>
  );
}
