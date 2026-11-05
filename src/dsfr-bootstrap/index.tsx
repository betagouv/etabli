'use client';

import { DsfrProviderBase, StartDsfrOnHydration } from '@codegouvfr/react-dsfr/next-app-router';
import Link from 'next/link';
import { PropsWithChildren } from 'react';

import { defaultColorScheme } from '@etabli/src/utils/dsfr';

declare module '@codegouvfr/react-dsfr/next-app-router' {
  interface RegisterLink {
    Link: typeof Link;
  }
}

// Client part of the react-dsfr integration for the app router (ref: https://react-dsfr.codegouv.studio/)
export function DsfrProvider(props: PropsWithChildren<{ lang: string; doCheckNonce?: boolean }>) {
  return (
    <DsfrProviderBase lang={props.lang} Link={Link} defaultColorScheme={defaultColorScheme} doCheckNonce={props.doCheckNonce}>
      {props.children}
    </DsfrProviderBase>
  );
}

export { StartDsfrOnHydration };
