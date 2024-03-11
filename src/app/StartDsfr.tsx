'use client';

import { startReactDsfr } from '@codegouvfr/react-dsfr/next-appdir';
import Link from 'next/link';

import { defaultColorScheme } from '@etabli/src/utils/dsfr';

declare module '@codegouvfr/react-dsfr/next-appdir' {
  interface RegisterLink {
    Link: typeof Link;
  }
}

startReactDsfr({ defaultColorScheme, Link, doCheckNonce: true });

export function StartDsfr() {
  return null;
}

export default StartDsfr;
