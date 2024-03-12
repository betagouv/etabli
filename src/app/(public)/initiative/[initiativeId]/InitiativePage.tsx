'use client';

import DataObjectIcon from '@mui/icons-material/DataObject';
import LanguageIcon from '@mui/icons-material/Language';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { useTranslation } from 'react-i18next';

import { trpc } from '@etabli/src/client/trpcClient';
import { BusinessUseCaseChip } from '@etabli/src/components/BusinessUseCaseChip';
import { ErrorAlert } from '@etabli/src/components/ErrorAlert';
import { FunctionalUseCaseChip } from '@etabli/src/components/FunctionalUseCaseChip';
import { LoadingArea } from '@etabli/src/components/LoadingArea';
import { ToolChip } from '@etabli/src/components/ToolChip';
import { initiativeNotFoundError } from '@etabli/src/models/entities/errors';
import { centeredAlertContainerGridProps, centeredContainerGridProps, ulComponentResetStyles } from '@etabli/src/utils/grid';

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
        <Grid item xs={12}>
          <Typography component="div" variant="caption" sx={{ fontStyle: 'italic', mt: 2 }}>
            Fiche mise à jour le {t('date.longWithTime', { date: initiative.updatedAt })}
          </Typography>
        </Grid>
      </Grid>
    </>
  );
}
