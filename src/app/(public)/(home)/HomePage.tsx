'use client';

import Grid from '@mui/material/Grid';

import { Introduction } from '@etabli/src/app/(public)/(home)/Introduction';
import { KeyReasons } from '@etabli/src/app/(public)/(home)/KeyReasons';

export function HomePage() {
  return (
    <Grid
      container
      sx={{
        display: 'block',
        mx: 'auto',
      }}
    >
      <Introduction />
      <KeyReasons />
    </Grid>
  );
}
