'use client';

import DataObjectIcon from '@mui/icons-material/DataObject';
import LanguageIcon from '@mui/icons-material/Language';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { useMemo } from 'react';
import ShowMoreText from 'react-show-more-text';

import { InitiativeSchemaType } from '@etabli/src/models/entities/initiative';
import { ulComponentResetStyles } from '@etabli/src/utils/grid';

export interface InitiativeCardProps {
  initiativeLink: string;
  initiative: InitiativeSchemaType;
}

export function InitiativeCard(props: InitiativeCardProps) {
  const referencesLinks = useMemo(() => {
    const links: string[] = [];

    // Consider as "principal" the main website and the main repository
    if (props.initiative.websites.length > 0) {
      links.push(props.initiative.websites[0]);
    }
    if (props.initiative.repositories.length > 0) {
      links.push(props.initiative.repositories[0]);
    }

    return links;
  }, [props.initiative]);

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word', // Needed in case of word/sentence bigger than parent width (it applies on all children)
      }}
    >
      <CardContent>
        <Grid container direction={'column'} spacing={2}>
          <Grid item xs={12}>
            <Link component={NextLink} href={props.initiativeLink} variant="h5" color="inherit" underline="none" style={{ fontWeight: 600 }}>
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
                      }}
                    >
                      <LanguageIcon sx={{ fontSize: 16, mr: 1 }} />
                      <Link component={NextLink} href={props.initiative.websites[0]} variant="subtitle2" underline="none" target="_blank">
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
                      }}
                    >
                      <DataObjectIcon sx={{ fontSize: 16, mr: 1 }} />
                      <Link component={NextLink} href={props.initiative.repositories[0]} variant="subtitle2" underline="none" target="_blank">
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
