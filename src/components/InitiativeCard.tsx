'use client';

import DataObjectIcon from '@mui/icons-material/DataObject';
import LanguageIcon from '@mui/icons-material/Language';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import ShowMoreText from 'react-show-more-text';

import { InitiativeSchemaType } from '@etabli/src/models/entities/initiative';
import { ulComponentResetStyles } from '@etabli/src/utils/grid';

export interface InitiativeCardProps {
  initiativeLink: string;
  initiative: InitiativeSchemaType;
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
        <Grid container direction={'column'} spacing={2}>
          <Grid item xs={12}>
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
          </Grid>
          <Grid item xs={12}>
            <Typography component="div">
              <ShowMoreText lines={3} more="Voir plus" less="Voir moins">
                {props.initiative.description}
              </ShowMoreText>
            </Typography>
          </Grid>
          {(props.initiative.websites.length > 0 || props.initiative.repositories.length > 0) && (
            <Grid item xs={12}>
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
                      </Link>
                    </Typography>
                  </li>
                )}
              </ul>
            </Grid>
          )}
        </Grid>
      </CardContent>
    </Card>
  );
}
