'use client';

import { fr } from '@codegouvfr/react-dsfr';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';

import { dsfrContainerSx, ulComponentResetStyles } from '@etabli/src/utils/grid';
import { getInitiativePathname } from '@etabli/src/utils/initiative-link';
import { RelatedInitiative, getRelatedInitiativeMainAddress, relatedInitiativesColumnsByBreakpoint } from '@etabli/src/utils/related-initiatives';

const columnsByBreakpoint = relatedInitiativesColumnsByBreakpoint;

export interface RelatedInitiativesProps {
  initiatives: RelatedInitiative[];
}

// A band apart from the sheet, like the questions on the home page, since these initiatives are only of the same organization
// and not linked to the current one. Given by the server so search engines follow these links
export function RelatedInitiatives(props: RelatedInitiativesProps) {
  return (
    <Container
      component="section"
      maxWidth={false}
      disableGutters
      sx={{ bgcolor: fr.colors.decisions.background.alt.blueFrance.default, py: { xs: 3, md: 4 } }}
    >
      {/* Aligned on the sheet above */}
      <Box sx={dsfrContainerSx}>
        <Typography component="h2" variant="h6" sx={{ mt: 0, mb: 2 }}>
          D&apos;autres initiatives de la même organisation
        </Typography>
        <Grid
          container
          component="ul"
          spacing={2}
          sx={{
            ...ulComponentResetStyles,
            // A single row whatever the screen: the server gives a few of them and those not fitting are hidden (they stay in the page for search engines)
            [`& > li:nth-of-type(n+${columnsByBreakpoint.xs + 1})`]: { display: { xs: 'none', sm: 'block' } },
            [`& > li:nth-of-type(n+${columnsByBreakpoint.sm + 1})`]: { display: { sm: 'none', md: 'block' } },
            [`& > li:nth-of-type(n+${columnsByBreakpoint.md + 1})`]: { display: { md: 'none', lg: 'block' } },
            [`& > li:nth-of-type(n+${columnsByBreakpoint.lg + 1})`]: { display: { lg: 'none' } },
          }}
        >
          {props.initiatives.map((initiative) => {
            const address = getRelatedInitiativeMainAddress(initiative);

            return (
              <Grid
                key={initiative.id}
                component="li"
                size={{
                  xs: 12 / columnsByBreakpoint.xs,
                  sm: 12 / columnsByBreakpoint.sm,
                  md: 12 / columnsByBreakpoint.md,
                  lg: 12 / columnsByBreakpoint.lg,
                }}
              >
                {/* What it is about when pointing or focusing it, the name alone is often a technical one (a repository). It describes the
                    link instead of replacing its name for screen readers */}
                <Tooltip title={initiative.description} describeChild enterDelay={300} enterNextDelay={300} placement="top">
                  <Card
                    variant="outlined"
                    sx={{
                      height: '100%',
                      position: 'relative',
                      transition: 'box-shadow 120ms ease-in-out, border-color 120ms ease-in-out',
                      '&:hover, &:focus-within': {
                        boxShadow: 2,
                        borderColor: 'primary.main',
                        '& .related-initiative-arrow': { color: 'primary.main', transform: 'translateX(2px)' },
                      },
                    }}
                  >
                    <CardContent sx={{ p: '8px 12px !important', display: 'flex', alignItems: 'center', gap: 1, height: '100%' }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Link
                          component={NextLink}
                          href={getInitiativePathname(initiative.id, initiative.name)}
                          variant="body2"
                          color="inherit"
                          underline="none"
                          sx={{
                            display: 'block',
                            fontWeight: 600,
                            backgroundImage: 'none !important',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            // The whole card opens the sheet
                            '&::after': { content: '""', position: 'absolute', inset: 0 },
                          }}
                        >
                          {initiative.name}
                        </Link>
                        {!!address && (
                          <Typography variant="caption" component="div" noWrap sx={{ color: 'text.secondary' }}>
                            {address}
                          </Typography>
                        )}
                      </Box>
                      {/* Tells the card leads somewhere, the link itself covers the whole card */}
                      <ArrowForwardIcon
                        className="related-initiative-arrow"
                        aria-hidden="true"
                        sx={{
                          flexShrink: 0,
                          fontSize: 18,
                          color: 'text.secondary',
                          transition: 'transform 120ms ease-in-out, color 120ms ease-in-out',
                        }}
                      />
                    </CardContent>
                  </Card>
                </Tooltip>
              </Grid>
            );
          })}
        </Grid>
      </Box>
    </Container>
  );
}
