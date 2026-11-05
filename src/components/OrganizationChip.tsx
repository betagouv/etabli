'use client';

import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Tooltip, { TooltipProps } from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { SxProps, Theme } from '@mui/material/styles';
import NextLink from 'next/link';

import { OrganizationTree } from '@etabli/src/components/OrganizationTree';
import { OrganizationSummary, formatOrganizationPath } from '@etabli/src/utils/organization';
import { linkRegistry } from '@etabli/src/utils/routes/registry';

export function getOrganizationInitiativesLink(organizationId: string): string {
  return `${linkRegistry.get('initiatives', undefined)}?orgs=${encodeURIComponent(organizationId)}`;
}

export function getUnclassifiedInitiativesLink(): string {
  return `${linkRegistry.get('initiatives', undefined)}?nc=true`;
}

// A light tooltip is more readable than the default dark one for structured content
const tooltipSlotProps: TooltipProps['componentsProps'] = {
  tooltip: {
    sx: {
      bgcolor: 'var(--background-default-grey)',
      color: 'var(--text-default-grey)',
      border: '1px solid var(--border-default-grey)',
      boxShadow: 3,
      maxWidth: 420,
      p: 1.5,
    },
  },
  arrow: {
    sx: {
      color: 'var(--background-default-grey)',
      '&::before': { border: '1px solid var(--border-default-grey)' },
    },
  },
};

const chipSx = {
  bgcolor: 'var(--background-contrast-grey)',
  maxWidth: '100%',
  height: 'auto',
  // Same look as other chips (e.g. business use cases), with `!important` because DSFR resets the padding of links
  p: '5px !important',
  fontSize: '0.8125rem',
  lineHeight: 1.4,
  backgroundImage: 'none !important', // DSFR paints a link underline as a background
  '&.MuiChip-clickable:hover, &.MuiChip-clickable:focus-visible': {
    bgcolor: 'var(--background-contrast-grey-hover)',
  },
  '& > .MuiChip-icon': {
    fontSize: '1.1rem',
    ml: '6px',
    mr: '-2px',
  },
  // One line whatever the name length so all cards look alike, the full information is in the tooltip
  '& > .MuiChip-label': {
    display: 'block',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
};

export interface OrganizationChipProps {
  summary: OrganizationSummary;
  linkToInitiatives?: boolean;
}

export function OrganizationChip(props: OrganizationChipProps) {
  const { organization, paths } = props.summary;
  const accessiblePaths = paths.map((organizationPath) =>
    formatOrganizationPath({ ...organizationPath[organizationPath.length - 1], ancestors: organizationPath.slice(0, -1) })
  );

  return (
    <Tooltip
      arrow
      componentsProps={tooltipSlotProps}
      title={
        <>
          <Typography variant="caption" component="div" sx={{ fontWeight: 700, mb: 0.5 }}>
            {paths.length > 1 ? 'Organisations rattachées' : 'Organisation rattachée'}
          </Typography>
          <OrganizationTree paths={paths} />
        </>
      }
    >
      <Chip
        icon={<AccountBalanceIcon />}
        label={organization.name}
        {...(props.linkToInitiatives
          ? {
              component: NextLink,
              href: getOrganizationInitiativesLink(organization.id),
              clickable: true,
              'aria-label': `Voir les initiatives de « ${organization.name} » (${accessiblePaths.join(' ; ')})`,
            }
          : {
              'aria-label': `${organization.name} (${accessiblePaths.join(' ; ')})`,
            })}
        sx={chipSx}
      />
    </Tooltip>
  );
}

export interface UnclassifiedOrganizationChipProps {
  linkToInitiatives?: boolean;
}

export function UnclassifiedOrganizationChip(props: UnclassifiedOrganizationChipProps) {
  return (
    <Tooltip
      arrow
      componentsProps={tooltipSlotProps}
      title={
        <Typography variant="caption" component="div">
          Aucune organisation publique n&apos;a pu être reconnue à partir des sites internet et des dépôts de code de cette initiative.
        </Typography>
      }
    >
      <Chip
        icon={<HelpOutlineIcon />}
        label="Non classée"
        variant="outlined"
        {...(props.linkToInitiatives
          ? {
              component: NextLink,
              href: getUnclassifiedInitiativesLink(),
              clickable: true,
              'aria-label': 'Voir les initiatives non classées (aucune organisation reconnue)',
            }
          : {})}
        sx={{
          ...chipSx,
          bgcolor: 'transparent',
          color: 'text.secondary',
          borderStyle: 'dashed',
        }}
      />
    </Tooltip>
  );
}

export interface OrganizationChipsProps {
  summaries: OrganizationSummary[];
  linkToInitiatives?: boolean;
  sx?: SxProps<Theme>;
}

// A plain flex list (instead of a grid with negative margins) so long names are truncated within the parent width
export function OrganizationChips(props: OrganizationChipsProps) {
  const itemSx = { maxWidth: '100%', minWidth: 0, display: 'flex' };

  return (
    <Box
      component="ul"
      aria-label="organisations"
      sx={[
        { display: 'flex', flexWrap: 'wrap', gap: 1, listStyle: 'none', m: 0, p: 0, minWidth: 0, maxWidth: '100%' },
        ...(Array.isArray(props.sx) ? props.sx : [props.sx]),
      ]}
    >
      {props.summaries.length > 0 ? (
        props.summaries.map((summary) => (
          <Box component="li" key={summary.organization.id} sx={itemSx}>
            <OrganizationChip summary={summary} linkToInitiatives={props.linkToInitiatives} />
          </Box>
        ))
      ) : (
        <Box component="li" sx={itemSx}>
          <UnclassifiedOrganizationChip linkToInitiatives={props.linkToInitiatives} />
        </Box>
      )}
    </Box>
  );
}
