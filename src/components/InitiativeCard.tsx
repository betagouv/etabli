'use client';

import DataObjectIcon from '@mui/icons-material/DataObject';
import LanguageIcon from '@mui/icons-material/Language';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { useMemo } from 'react';

import { ClampedText } from '@etabli/src/components/ClampedText';
import { OrganizationChips } from '@etabli/src/components/OrganizationChip';
import { InitiativeRankingChips } from '@etabli/src/components/ReputationChip';
import { InitiativeSchemaType } from '@etabli/src/models/entities/initiative';
import { ulComponentResetStyles } from '@etabli/src/utils/grid';
import { summarizeOrganizations } from '@etabli/src/utils/organization';

// Around 3 lines of a card at the usual widths, so the server already renders the "Voir plus" most of the time
const likelyClampedDescriptionLength = 150;

export interface InitiativeCardProps {
  initiativeLink: string;
  initiative: InitiativeSchemaType;
  focusedOrganizationsIds?: string[]; // When filtering on precise organizations, they are displayed instead of their ministry
}

// DSFR paints the link underline via `background-image` on the whole link box; on a wrapped URL the
// "underline" then spans the empty space at the end of each line. We disable that and let the browser
// draw a native text-decoration underline instead
const cardUrlSx = {
  backgroundImage: 'none !important',
  textDecorationLine: 'underline',
  textUnderlineOffset: '3px',
};

export function InitiativeCard(props: InitiativeCardProps) {
  // The card uses an overlay link covering its whole surface so users can click anywhere to open the
  // initiative — the title alone was missed. Inner anchors (website, repository, "Voir plus") sit above
  // the overlay via `position: relative; zIndex: 1` so they keep their own click behavior.
  const interactiveLayer = { position: 'relative' as const, zIndex: 1 };

  const organizationSummaries = useMemo(
    () => summarizeOrganizations(props.initiative.organizations, props.focusedOrganizationsIds),
    [props.initiative.organizations, props.focusedOrganizationsIds]
  );

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        position: 'relative',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word', // Needed in case of word/sentence bigger than parent width (it applies on all children)
        cursor: 'pointer', // the whole card is a link; show the pointer cursor everywhere, including on the description text
        transition: 'box-shadow 120ms ease-in-out, border-color 120ms ease-in-out',
        '&:hover, &:focus-within': {
          // Outlined cards don't elevate by default
          boxShadow: 4,
          borderColor: 'primary.main',
        },
        '& .initiative-card-overlay-link': {
          backgroundImage: 'none !important',
          textDecoration: 'none !important',
        },
        '& .show-more-less-clickable': {
          // This must keep priority as link over the card
          position: 'relative',
          zIndex: 1,
        },
      }}
    >
      <NextLink
        href={props.initiativeLink}
        aria-label={props.initiative.name}
        className="initiative-card-overlay-link"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
        }}
      />
      <CardContent>
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <Box>
            <Link
              component={NextLink}
              href={props.initiativeLink}
              variant="h5"
              color="inherit"
              underline="none"
              style={{ fontWeight: 600, ...interactiveLayer }}
              tabIndex={-1}
            >
              {props.initiative.name}
            </Link>
          </Box>
          <Box sx={{ mt: 1, minWidth: 0 }}>
            <OrganizationChips
              summaries={organizationSummaries}
              websitesCount={props.initiative.websites.length}
              repositoriesCount={props.initiative.repositories.length}
              linkToInitiatives
              sx={interactiveLayer}
            />
            {/* Only as wide as its chips so the rest of the line still opens the sheet, and not looking clickable since chips only explain on hover */}
            <InitiativeRankingChips initiative={props.initiative} sx={{ mt: 1, ...interactiveLayer, width: 'fit-content', cursor: 'default' }} />
          </Box>
          <Box sx={{ mt: 2 }}>
            <Typography component="div">
              <ClampedText lines={3} likelyClamped={props.initiative.description.length > likelyClampedDescriptionLength}>
                {props.initiative.description}
              </ClampedText>
            </Typography>
          </Box>
          {(props.initiative.websites.length > 0 || props.initiative.repositories.length > 0) && (
            <Box sx={{ mt: 2 }}>
              <ul style={{ ...ulComponentResetStyles }}>
                {props.initiative.websites.length > 0 && (
                  <li key={props.initiative.websites[0]}>
                    <Typography
                      component="div"
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        ...interactiveLayer,
                      }}
                    >
                      <LanguageIcon sx={{ fontSize: 16, mr: 1 }} />
                      <Link
                        component={NextLink}
                        href={props.initiative.websites[0]}
                        variant="subtitle2"
                        underline="none"
                        target="_blank"
                        sx={cardUrlSx}
                      >
                        {props.initiative.websites[0]}
                        <span className="fr-sr-only"> (nouvelle fenêtre)</span>
                      </Link>
                    </Typography>
                  </li>
                )}
                {props.initiative.repositories.length > 0 && (
                  <li key={props.initiative.repositories[0]}>
                    <Typography
                      component="div"
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        ...interactiveLayer,
                      }}
                    >
                      <DataObjectIcon sx={{ fontSize: 16, mr: 1 }} />
                      <Link
                        component={NextLink}
                        href={props.initiative.repositories[0]}
                        variant="subtitle2"
                        underline="none"
                        target="_blank"
                        sx={cardUrlSx}
                      >
                        {props.initiative.repositories[0]}
                        <span className="fr-sr-only"> (nouvelle fenêtre)</span>
                      </Link>
                    </Typography>
                  </li>
                )}
              </ul>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
