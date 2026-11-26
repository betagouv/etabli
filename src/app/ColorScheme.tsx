'use client';

import { useIsDark } from '@codegouvfr/react-dsfr/useIsDark';
import { SsrIsDarkProvider } from '@codegouvfr/react-dsfr/useIsDark/server';
import { PropsWithChildren, useEffect } from 'react';

import { colorSchemeCookieName } from '@etabli/src/utils/color-scheme';
import { defaultColorScheme } from '@etabli/src/utils/dsfr';
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

  // When a page calls `notFound()` the server sends an empty document and the browser renders all of it, the theme script of
  // `DsfrHead` is not executed and the attributes set by react-dsfr at its start are removed, the page would stay light
  useEffect(() => {
    const root = document.documentElement;

    if (!root.hasAttribute('data-fr-theme')) {
      root.setAttribute('data-fr-scheme', localStorage.getItem('scheme') ?? defaultColorScheme);
      root.setAttribute('data-fr-theme', isDark ? 'dark' : 'light');
    }
  }, [isDark]);

  return null;
}
