'use client';

import { useIsDark } from '@codegouvfr/react-dsfr/useIsDark';
import { SsrIsDarkProvider } from '@codegouvfr/react-dsfr/useIsDark/server';
import { PropsWithChildren, useEffect } from 'react';

import { colorSchemeCookieName } from '@etabli/src/utils/color-scheme';
import { setPreferenceCookie } from '@etabli/src/utils/preference-cookie';

export function ServerColorSchemeProvider(props: PropsWithChildren<{ isDark: boolean }>) {
  return <SsrIsDarkProvider value={props.isDark}>{props.children}</SsrIsDarkProvider>;
}

// Remembers the color scheme actually used (including the system one) so the next pages are rendered with it by the server
export function ColorSchemeCookie() {
  const { isDark } = useIsDark();

  useEffect(() => {
    setPreferenceCookie(colorSchemeCookieName, isDark ? 'dark' : 'light');
  }, [isDark]);

  return null;
}
