'use client';

import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import DataObjectIcon from '@mui/icons-material/DataObject';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LanguageIcon from '@mui/icons-material/Language';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { useTranslation } from 'react-i18next';

import { trpc } from '@etabli/src/client/trpcClient';
import { BusinessUseCaseChip } from '@etabli/src/components/BusinessUseCaseChip';
import { ErrorAlert } from '@etabli/src/components/ErrorAlert';
import { FunctionalUseCaseChip } from '@etabli/src/components/FunctionalUseCaseChip';
import { InitiativeReputationDashboard } from '@etabli/src/components/InitiativeReputationDashboard';
import { LoadingArea } from '@etabli/src/components/LoadingArea';
import { getOrganizationInitiativesLink, organizationsBindingDisclaimer } from '@etabli/src/components/OrganizationChip';
import { OrganizationTree } from '@etabli/src/components/OrganizationTree';
import { InitiativeRankingChips } from '@etabli/src/components/ReputationChip';
import { ToolChip } from '@etabli/src/components/ToolChip';
import { initiativeNotFoundError } from '@etabli/src/models/entities/errors';
import { centeredAlertContainerGridProps, centeredContainerGridProps, ulComponentResetStyles } from '@etabli/src/utils/grid';
import { getOrganizationPath } from '@etabli/src/utils/organization';

export interface InitiativePageProps {
  params: {
    initiativeId: string;
  };
}

export function InitiativePage({ params: { initiativeId } }: InitiativePageProps) {
  const { t } = useTranslation('common');

  const { data, error, isLoading, refetch } = trpc.getInitiative.useQuery({
    id: initiativeId,
  });

  if (isLoading) {
    return <LoadingArea ariaLabelTarget="contenu" />;
  } else if (error) {
    return (
      <Grid container {...centeredAlertContainerGridProps}>
        {error.data?.code === 'BAD_REQUEST' && error.data.zodError && error.data.zodError[0].code === 'invalid_string' ? (
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
    <>
      <Grid container {...centeredContainerGridProps} alignContent="flex-start" spacing={2}>
        <Grid item xs={12}>
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
          item
          xs={12}
          sx={{
            pb: 2,
            whiteSpace: 'pre-wrap !important',
            wordBreak: 'break-word !important', // Needed in case of word/sentence bigger than parent width
          }}
        >
          {initiative.description}
        </Grid>
        {initiative.websites.length > 0 && (
          <Grid item xs={12} md={6}>
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
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Grid>
        )}
        {initiative.repositories.length > 0 && (
          <Grid item xs={12} md={6}>
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
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Grid>
        )}
        {initiative.businessUseCases.length > 0 && (
          <Grid item xs={12}>
            <Typography component="div" variant="overline">
              {t('model.initiative.businessUseCase', { count: initiative.businessUseCases.length })}
            </Typography>
            <Grid container component="ul" direction="row" spacing={1} sx={ulComponentResetStyles}>
              {initiative.businessUseCases.map((businessUseCase) => {
                return (
                  <Grid key={businessUseCase} item component="li">
                    <BusinessUseCaseChip label={businessUseCase} />
                  </Grid>
                );
              })}
            </Grid>
          </Grid>
        )}
        {initiative.functionalUseCases.length > 0 && (
          <Grid item xs={12}>
            <Typography component="div" variant="overline">
              {t('model.initiative.functionalUseCase.label', { count: initiative.functionalUseCases.length })}
            </Typography>
            <Grid container component="ul" direction="row" spacing={1} sx={ulComponentResetStyles}>
              {initiative.functionalUseCases.map((functionalUseCase) => {
                return (
                  <Grid key={functionalUseCase} item component="li">
                    <FunctionalUseCaseChip useCase={functionalUseCase} />
                  </Grid>
                );
              })}
            </Grid>
          </Grid>
        )}
        {initiative.organizations.length > 0 && (
          <Grid item xs={12}>
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
                <IconButton size="small" aria-label={`À propos du rattachement : ${organizationsBindingDisclaimer}`} sx={{ ml: 0.5 }}>
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
          <Grid item xs={12}>
            <Typography component="div" variant="overline">
              {t('model.initiative.tool', { count: initiative.tools.length })}
            </Typography>
            <Grid container component="ul" direction="row" spacing={1} sx={ulComponentResetStyles}>
              {initiative.tools.map((tool) => {
                return (
                  <Grid key={tool} item component="li">
                    <ToolChip label={tool} />
                  </Grid>
                );
              })}
            </Grid>
          </Grid>
        )}
        <InitiativeReputationDashboard initiativeId={initiative.id} />
        <Grid item xs={12}>
          <Typography component="div" variant="caption" sx={{ fontStyle: 'italic', mt: 2 }}>
            Description générée le {t('date.longWithTime', { date: initiative.updatedAt })}
          </Typography>
        </Grid>
      </Grid>
    </>
  );
}
