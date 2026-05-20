'use client';

import Button from '@mui/lab/LoadingButton';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Image from 'next/image';
import * as React from 'react';

import style from '@etabli/src/app/(public)/(home)/Introduction.module.scss';
import hero from '@etabli/src/assets/images/hero.png';
import { useSingletonExploreModal } from '@etabli/src/components/ExploreModal';
import { IntroductionContainer } from '@etabli/src/components/IntroductionContainer';

export function Introduction() {
  const { showExploreModal } = useSingletonExploreModal();

  return (
    <IntroductionContainer
      left={
        <Box
          sx={{
            px: 4,
            py: 3,
            textAlign: { xs: 'center', md: 'left' },
          }}
        >
          <Typography component="h1" variant="h2" sx={{ my: 2, maxWidth: 500 }}>
            Découvrir l&apos;existant, que l&apos;on soit agent ou citoyen
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 500 }}>
            Établi est un service qui référence les initiatives publiques numériques françaises, ce afin d&apos;augmenter leur découvrabilité et leur
            (ré)utilisation.
          </Typography>
          <Button onClick={() => showExploreModal()} size="large" variant="contained" sx={{ mb: 3 }}>
            Commencer l&apos;exploration
          </Button>
        </Box>
      }
      right={
        <Image
          src={hero}
          alt=""
          priority={true}
          className={style.hero}
          style={{
            color: undefined, // [WORKAROUND] Ref: https://github.com/vercel/next.js/issues/61388#issuecomment-1988278891
          }}
        />
      }
    />
  );
}
