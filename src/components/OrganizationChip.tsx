'use client';

import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { SxProps, Theme } from '@mui/material/styles';
import NextLink from 'next/link';

import { OrganizationTree } from '@etabli/src/components/OrganizationTree';
import { OrganizationSummary, formatOrganizationPath, getUnclassifiedExplanation } from '@etabli/src/utils/organization';
import { linkRegistry } from '@etabli/src/utils/routes/registry';

export function getOrganizationInitiativesLink(organizationId: string): string {
  return `${linkRegistry.get('initiatives', undefined)}?orgs=${encodeURIComponent(organizationId)}`;
}

// Organizations are deduced from websites and repositories (declared domains in the DILA directory, forge accounts listed
// by code.gouv.fr), so users must know it may be inaccurate
export const organizationsBindingDisclaimer =
  "Organisations déduites automatiquement des sites internet (annuaire de l'administration) et des comptes de dépôts de code (code.gouv.fr), le rattachement peut comporter des erreurs.";

export function getUnclassifiedInitiativesLink(): string {
  return `${linkRegistry.get('initiatives', undefined)}?nc=true`;
}

// Displayed as a plain line (icon and text) aligned on the other rows of a card, instead of a pill which looked indented
const lineSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 1,
  maxWidth: '100%',
  minWidth: 0,
  color: 'var(--text-mention-grey)',
  backgroundImage: 'none !important', // DSFR paints a link underline as a background
  textDecoration: 'none',
  '&[href]:hover, &[href]:focus-visible': {
    backgroundColor: 'transparent !important',
    color: 'var(--text-default-grey)',
    '& > .organization-line-name': { textDecoration: 'underline' },
  },
  '& > svg': { fontSize: 16, flexShrink: 0 },
  // One line whatever the name length so all cards look alike, the full information is in the tooltip
  '& > .organization-line-name': {
    fontSize: '0.8125rem',
    lineHeight: 1.4,
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
      describeChild // The tooltip describes the chip instead of replacing its accessible name
      title={
        <>
          <Typography variant="caption" component="div" sx={{ fontWeight: 700, mb: 0.5 }}>
            {paths.length > 1 ? 'Organisations rattachées' : 'Organisation rattachée'}
          </Typography>
          <OrganizationTree paths={paths} />
          <Typography variant="caption" component="div" color="text.secondary" sx={{ mt: 1, fontSize: '0.7rem', lineHeight: 1.3 }}>
            Rattachement déduit automatiquement, il peut comporter des erreurs.
          </Typography>
        </>
      }
    >
      <Box
        {...(props.linkToInitiatives
          ? {
              component: NextLink,
              href: getOrganizationInitiativesLink(organization.id),
              'aria-label': `Voir les initiatives de « ${organization.name} » (${accessiblePaths.join(' ; ')})`,
            }
          : {
              component: 'span',
              role: 'group',
              'aria-label': `${organization.name} (${accessiblePaths.join(' ; ')})`,
            })}
        sx={lineSx}
      >
        <AccountBalanceIcon aria-hidden="true" />
        <span className="organization-line-name">{organization.name}</span>
      </Box>
    </Tooltip>
  );
}

export interface UnclassifiedOrganizationChipProps {
  websitesCount: number;
  repositoriesCount: number;
  linkToInitiatives?: boolean;
}

export function UnclassifiedOrganizationChip(props: UnclassifiedOrganizationChipProps) {
  return (
    <Tooltip
      describeChild // The tooltip describes the chip instead of replacing its accessible name
      title={
        <Typography variant="caption" component="div">
          {getUnclassifiedExplanation(props.websitesCount, props.repositoriesCount)}
        </Typography>
      }
    >
      <Box
        {...(props.linkToInitiatives
          ? {
              component: NextLink,
              href: getUnclassifiedInitiativesLink(),
              'aria-label': 'Voir les initiatives non classées (aucune organisation reconnue)',
            }
          : { component: 'span' })}
        sx={lineSx}
      >
        <HelpOutlineIcon aria-hidden="true" />
        <span className="organization-line-name">Non classée</span>
      </Box>
    </Tooltip>
  );
}

export interface OrganizationChipsProps {
  summaries: OrganizationSummary[];
  websitesCount: number;
  repositoriesCount: number;
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
        {
          display: 'flex',
          flexWrap: 'wrap',
          columnGap: 2,
          rowGap: 0.5,
          listStyle: 'none',
          minWidth: 0,
          maxWidth: '100%',
          // Being a scroll container cancels the width the unwrapped names would impose on the parent layout,
          // the padding/negative margin pair keeps room for the focus outline
          overflow: 'hidden',
          p: '3px',
          m: '-3px',
        },
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
          <UnclassifiedOrganizationChip
            websitesCount={props.websitesCount}
            repositoriesCount={props.repositoriesCount}
            linkToInitiatives={props.linkToInitiatives}
          />
        </Box>
      )}
    </Box>
  );
}
