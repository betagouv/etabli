'use client';

import MenuBookIcon from '@mui/icons-material/MenuBook';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';

import { OrganizationAncestorSchemaType } from '@etabli/src/models/entities/organization';
import { OrganizationTreeNode, SUMMARY_ORGANIZATION_LEVEL, buildOrganizationTree } from '@etabli/src/utils/organization';

const bulletSize = 7;
const indentation = 14;
const lineColor = 'var(--border-plain-grey)';

interface OrganizationTreeOptions {
  variant: 'caption' | 'body2';
  getLink?: (organizationId: string) => string; // Names are links when provided
  onSelect?: (organizationId: string) => void; // Names are buttons when provided
  directoryUrls?: Record<string, string | null>; // Organizations having a page into the DILA directory
}

function OrganizationTreeItems(props: OrganizationTreeOptions & { nodes: OrganizationTreeNode[]; depth: number }) {
  // Vertical middle of the first line of a row, used to align bullets and connectors
  const rowMiddle = props.variant === 'caption' ? 9 : 11;

  return (
    <Box
      component="ul"
      sx={{
        listStyle: 'none',
        m: 0,
        p: 0,
        // Children connectors start right under the parent bullet
        ...(props.depth > 0 ? { ml: `${Math.floor(bulletSize / 2)}px` } : {}),
      }}
    >
      {props.nodes.map((node, index) => {
        const isLast = index === props.nodes.length - 1;
        // The first levels of the directory are generic categories, they stay discreet
        const isGeneric = node.level < SUMMARY_ORGANIZATION_LEVEL && !node.isBound;

        return (
          <Box
            component="li"
            key={node.organization.id}
            sx={{
              position: 'relative',
              ...(props.depth > 0
                ? {
                    pl: `${indentation}px`,
                    // Vertical connector: through the whole item, except for the last child where it stops at its row (└)
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      height: isLast ? `${rowMiddle}px` : '100%',
                      borderLeft: `1px solid ${lineColor}`,
                    },
                    // Horizontal connector to the bullet
                    '&::after': {
                      content: '""',
                      position: 'absolute',
                      left: 0,
                      top: `${rowMiddle}px`,
                      width: `${indentation - 3}px`,
                      borderTop: `1px solid ${lineColor}`,
                    },
                  }
                : {}),
            }}
          >
            <Typography
              component="div"
              variant={props.variant}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '6px',
                lineHeight: `${rowMiddle * 2}px`,
                color: isGeneric ? 'text.secondary' : 'text.primary',
                fontWeight: node.isBound ? 700 : 400,
              }}
            >
              <Box
                component="span"
                aria-hidden="true"
                sx={{
                  flexShrink: 0,
                  width: bulletSize,
                  height: bulletSize,
                  mt: `${rowMiddle - bulletSize / 2}px`,
                  borderRadius: '50%',
                  bgcolor: node.isBound ? 'var(--text-action-high-blue-france)' : 'var(--background-default-grey)',
                  border: '1px solid',
                  borderColor: node.isBound ? 'var(--text-action-high-blue-france)' : lineColor,
                  position: 'relative',
                  zIndex: 1,
                }}
              />
              <span>
                {props.onSelect ? (
                  <Link
                    component="button"
                    variant={props.variant}
                    underline="hover"
                    onClick={() => props.onSelect?.(node.organization.id)}
                    sx={{ fontWeight: 'inherit', textAlign: 'left', verticalAlign: 'baseline' }}
                  >
                    {node.organization.name}
                  </Link>
                ) : props.getLink ? (
                  <Link
                    component={NextLink}
                    href={props.getLink(node.organization.id)}
                    underline="none"
                    title={`Voir les initiatives de « ${node.organization.name} »`}
                    sx={{ fontWeight: 'inherit' }}
                  >
                    {node.organization.name}
                  </Link>
                ) : (
                  node.organization.name
                )}
                {node.isBound && <span className="fr-sr-only"> (organisation rattachée)</span>}
                {props.directoryUrls?.[node.organization.id] && (
                  <Tooltip title="Voir sa fiche dans l'annuaire de l'administration">
                    <IconButton
                      component={NextLink}
                      href={props.directoryUrls[node.organization.id] as string}
                      target="_blank"
                      size="small"
                      aria-label={`Voir la fiche de « ${node.organization.name} » dans l'annuaire de l'administration (nouvelle fenêtre)`}
                      sx={{
                        ml: 1,
                        p: '4px',
                        my: '-4px',
                        verticalAlign: 'middle',
                        backgroundImage: 'none !important', // DSFR paints a link underline as a background
                        '&::after': { display: 'none !important' }, // DSFR appends an external link icon
                      }}
                    >
                      <MenuBookIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </span>
            </Typography>
            {node.children.length > 0 && <OrganizationTreeItems {...props} nodes={node.children} depth={props.depth + 1} />}
          </Box>
        );
      })}
    </Box>
  );
}

export interface OrganizationTreeProps extends Partial<OrganizationTreeOptions> {
  paths: OrganizationAncestorSchemaType[][]; // From the root to the bound organization
}

export function OrganizationTree({ paths, variant = 'caption', ...options }: OrganizationTreeProps) {
  return <OrganizationTreeItems {...options} variant={variant} nodes={buildOrganizationTree(paths)} depth={0} />;
}
