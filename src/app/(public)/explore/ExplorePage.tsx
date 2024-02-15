'use client';

import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';

import agent1 from '@etabli/src/assets/images/agent_1.png';
import agent2 from '@etabli/src/assets/images/agent_2.png';
import { QuickAccessCard } from '@etabli/src/components/QuickAccessCard';
import { linkRegistry } from '@etabli/src/utils/routes/registry';

export function ExplorePage() {
  return (
    <Container
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        py: 3,
      }}
    >
      <Typography component="h1" variant="h4" sx={{ textAlign: 'center', mt: 1, mb: { xs: 2, sm: 4 } }}>
        Quel mode d&apos;exploration voulez-vous utiliser ?
      </Typography>
      <Grid container spacing={2} justifyContent="center">
        <Grid item xs={10} sm={6} md={6} lg={5}>
          <QuickAccessCard image={agent1} imageAlt="" link={linkRegistry.get('initiatives', undefined)} text="Parcourir la liste manuellement" />
        </Grid>
        <Grid item xs={10} sm={6} md={6} lg={5}>
          <QuickAccessCard image={agent2} imageAlt="" link={linkRegistry.get('assistant', undefined)} text="Échanger avec l'assistant virtuel" />
        </Grid>
      </Grid>
    </Container>
  );
}
