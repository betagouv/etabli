'use client';

import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import DataObjectIcon from '@mui/icons-material/DataObject';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LanguageIcon from '@mui/icons-material/Language';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Theme } from '@mui/material/styles';
import NextLink from 'next/link';
import { useTranslation } from 'react-i18next';

import { trpc } from '@etabli/src/client/trpcClient';
import { BusinessUseCaseChip } from '@etabli/src/components/BusinessUseCaseChip';
import { ErrorAlert } from '@etabli/src/components/ErrorAlert';
import { FunctionalUseCaseChip } from '@etabli/src/components/FunctionalUseCaseChip';
import { InitiativeReputationDashboard, initiativeSecondaryContentAttribute } from '@etabli/src/components/InitiativeReputationDashboard';
import { LoadingArea } from '@etabli/src/components/LoadingArea';
import { getOrganizationInitiativesLink, organizationsBindingDisclaimer } from '@etabli/src/components/OrganizationChip';
import { OrganizationTree } from '@etabli/src/components/OrganizationTree';
import { RelatedInitiatives } from '@etabli/src/components/RelatedInitiatives';
import { InitiativeRankingChips } from '@etabli/src/components/ReputationChip';
import { ToolChip } from '@etabli/src/components/ToolChip';
import { initiativeNotFoundError } from '@etabli/src/models/entities/errors';
import { centeredAlertContainerGridProps, dsfrContainerSx, ulComponentResetStyles } from '@etabli/src/utils/grid';
import { getOrganizationPath } from '@etabli/src/utils/organization';
import { serverPrefetchedQueryStaleTime } from '@etabli/src/utils/query';
import { RelatedInitiative } from '@etabli/src/utils/related-initiatives';

const numberFormatter = new Intl.NumberFormat('fr-FR');
// The time zone is fixed so the server renders the same text as browsers
// The date and the time are joined here: the separator of a combined format changed across ICU versions ("à" or a comma), so the
// page rendered by the server (Node.js) could differ from the browser one and fail its hydration
const generationDayFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeZone: 'Europe/Paris' });
const generationTimeFormatter = new Intl.DateTimeFormat('fr-FR', { timeStyle: 'medium', timeZone: 'Europe/Paris' });

function formatGenerationDate(date: Date): string {
  return `${generationDayFormatter.format(date)} à ${generationTimeFormatter.format(date)}`;
}

// On a wide screen what is secondary moves to the right, otherwise it follows the main content. Whether there is some or not, the sheet
// keeps the width of the header and the footer
const pageLayoutSx = (theme: Theme) => ({
  ...dsfrContainerSx,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gridTemplateAreas: '"main" "secondary" "footer"',
  py: 6,
  [theme.breakpoints.up('xl')]: {
    [`&:has([${initiativeSecondaryContentAttribute}])`]: {
      gridTemplateColumns: 'minmax(0, 1fr) 520px',
      gridTemplateRows: 'auto 1fr',
      gridTemplateAreas: '"main secondary" "footer secondary"',
      columnGap: 5,
    },
  },
});

export interface InitiativePageProps {
  params: {
    initiativeId: string;
  };
  relatedInitiatives?: RelatedInitiative[]; // Other ones of the same organization
}

export function InitiativePage({ params: { initiativeId }, relatedInitiatives }: InitiativePageProps) {
  const { t } = useTranslation('common');

  const { data, error, isPending, refetch } = trpc.getInitiative.useQuery(
    {
      id: initiativeId,
    },
    {
      staleTime: serverPrefetchedQueryStaleTime,
    }
  );

  if (isPending) {
    return <LoadingArea ariaLabelTarget="contenu" />;
  } else if (error) {
    return (
      <Grid container {...centeredAlertContainerGridProps}>
        {error.data?.code === 'BAD_REQUEST' && error.data.zodError && error.data.zodError[0].code === 'invalid_format' ? (
          // Since this page can be referenced by the assistant and that sometimes the assistant is more creative than it should
          // It creates links with UUID not existing, or preprending/appending some by adding a 0 or so, makin it invalid
          // We just warn the user about this so he can have a bit of context why it fails
          <ErrorAlert errors={[initiativeNotFoundError]} />
        ) : (
          <ErrorAlert errors={[error]} refetchs={[refetch]} />
        )}
      </Grid>
    );
  }

  const initiative = data.initiative;

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={pageLayoutSx}>
        <Box sx={{ gridArea: 'main', minWidth: 0 }}>
          <Grid container alignContent="flex-start" spacing={2}>
            <Grid size={12}>
              <Typography
                component="h1"
                variant="h1"
                data-sentry-mask
                sx={{
                  whiteSpace: 'pre-wrap !important',
                  wordBreak: 'break-word !important', // Needed in case of word/sentence bigger than parent width
                }}
              >
                {initiative.name}
              </Typography>
              <InitiativeRankingChips initiative={initiative} sx={{ mt: 1 }} />
            </Grid>
            <Grid
              sx={{
                pb: 2,
                whiteSpace: 'pre-wrap !important',
                wordBreak: 'break-word !important', // Needed in case of word/sentence bigger than parent width
              }}
              size={12}
            >
              {initiative.description}
            </Grid>
            {initiative.websites.length > 0 && (
              <Grid
                size={{
                  xs: 12,
                  md: 6,
                }}
              >
                <Typography
                  component="div"
                  variant="overline"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {t('model.initiative.website', { count: initiative.websites.length })} <LanguageIcon sx={{ ml: 1 }} />
                </Typography>
                <ul style={{ ...ulComponentResetStyles }}>
                  {initiative.websites.map((website) => {
                    return (
                      <li key={website}>
                        <Link
                          component={NextLink}
                          href={website}
                          variant="subtitle2"
                          underline="none"
                          target="_blank"
                          sx={{
                            whiteSpace: 'pre-wrap !important',
                            wordBreak: 'break-word !important', // Needed in case of word/sentence bigger than parent width
                          }}
                        >
                          {website}
                          <span className="fr-sr-only"> (nouvelle fenêtre)</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Grid>
            )}
            {initiative.repositories.length > 0 && (
              <Grid
                size={{
                  xs: 12,
                  md: 6,
                }}
              >
                <Typography
                  component="div"
                  variant="overline"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {t('model.initiative.repository', { count: initiative.repositories.length })} <DataObjectIcon sx={{ ml: 1 }} />
                </Typography>
                <ul style={{ ...ulComponentResetStyles }}>
                  {initiative.repositories.map((repository) => {
                    return (
                      <li key={repository}>
                        <Link
                          component={NextLink}
                          href={repository}
                          variant="subtitle2"
                          underline="none"
                          target="_blank"
                          sx={{
                            whiteSpace: 'pre-wrap !important',
                            wordBreak: 'break-word !important', // Needed in case of word/sentence bigger than parent width
                          }}
                        >
                          {repository}
                          <span className="fr-sr-only"> (nouvelle fenêtre)</span>
                        </Link>
                        {!!data.repositoriesStars[repository] && (
                          <Typography
                            component="span"
                            variant="caption"
                            sx={{ display: 'inline-flex', alignItems: 'center', gap: '2px', ml: 1, verticalAlign: 'middle', whiteSpace: 'nowrap' }}
                          >
                            <StarBorderIcon aria-hidden="true" sx={{ fontSize: 16 }} />
                            {numberFormatter.format(data.repositoriesStars[repository])}
                            <span className="fr-sr-only"> étoiles</span>
                          </Typography>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Grid>
            )}
            {initiative.businessUseCases.length > 0 && (
              <Grid size={12}>
                <Typography component="div" variant="overline">
                  {t('model.initiative.businessUseCase', { count: initiative.businessUseCases.length })}
                </Typography>
                <Grid container component="ul" direction="row" spacing={1} sx={{ ...ulComponentResetStyles, pt: 1 }}>
                  {initiative.businessUseCases.map((businessUseCase) => {
                    return (
                      <Grid key={businessUseCase} component="li">
                        <BusinessUseCaseChip label={businessUseCase} />
                      </Grid>
                    );
                  })}
                </Grid>
              </Grid>
            )}
            {initiative.functionalUseCases.length > 0 && (
              <Grid size={12}>
                <Typography component="div" variant="overline">
                  {t('model.initiative.functionalUseCase.label', { count: initiative.functionalUseCases.length })}
                </Typography>
                <Grid container component="ul" direction="row" spacing={1} sx={{ ...ulComponentResetStyles, pt: 1 }}>
                  {initiative.functionalUseCases.map((functionalUseCase) => {
                    return (
                      <Grid key={functionalUseCase} component="li">
                        <FunctionalUseCaseChip useCase={functionalUseCase} />
                      </Grid>
                    );
                  })}
                </Grid>
              </Grid>
            )}
            {initiative.organizations.length > 0 && (
              <Grid size={12}>
                <Typography
                  component="div"
                  variant="overline"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {t('model.initiative.organization', { count: initiative.organizations.length })} <AccountBalanceIcon sx={{ ml: 1 }} />
                  <Tooltip title={organizationsBindingDisclaimer}>
                    <IconButton size="small" aria-label={`À propos du rattachement : ${organizationsBindingDisclaimer}`} sx={{ ml: '0.25rem' }}>
                      <InfoOutlinedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Tooltip>
                </Typography>
                <OrganizationTree
                  variant="body2"
                  paths={initiative.organizations.map((organization) => getOrganizationPath(organization))}
                  getLink={getOrganizationInitiativesLink}
                  directoryUrls={Object.fromEntries(initiative.organizations.map((organization) => [organization.id, organization.directoryUrl]))}
                />
              </Grid>
            )}
            {initiative.tools.length > 0 && (
              <Grid size={12}>
                <Typography component="div" variant="overline">
                  {t('model.initiative.tool', { count: initiative.tools.length })}
                </Typography>
                <Grid container component="ul" direction="row" spacing={1} sx={{ ...ulComponentResetStyles, pt: 1 }}>
                  {initiative.tools.map((tool) => {
                    return (
                      <Grid key={tool} component="li">
                        <ToolChip label={tool} />
                      </Grid>
                    );
                  })}
                </Grid>
              </Grid>
            )}
          </Grid>
        </Box>
        <InitiativeReputationDashboard initiativeId={initiative.id} />
        <Typography component="div" variant="caption" sx={{ gridArea: 'footer', fontStyle: 'italic', mt: 2 }}>
          Description générée le {formatGenerationDate(initiative.computedAt)}
        </Typography>
      </Box>
      {!!relatedInitiatives && relatedInitiatives.length > 0 && <RelatedInitiatives initiatives={relatedInitiatives} />}
    </Box>
  );
}
