import { Display } from '@codegouvfr/react-dsfr/Display';
import { cookies, headers } from 'next/headers';
import { PropsWithChildren } from 'react';

import { ColorSchemeCookie, ServerColorSchemeProvider } from '@etabli/src/app/ColorScheme';
import { Matomo } from '@etabli/src/app/Matomo';
import { MuiDsfrThemeProvider } from '@etabli/src/app/MuiDsfrThemeProvider';
import { SentryClientProvider } from '@etabli/src/app/SentryClientProvider';
import '@etabli/src/app/layout.scss';
import { Providers } from '@etabli/src/app/providers';
import { LiveChatProvider } from '@etabli/src/components/live-chat/LiveChatProvider';
import { DsfrProvider, StartDsfrOnHydration } from '@etabli/src/dsfr-bootstrap';
import { DsfrHead, getHtmlAttributes } from '@etabli/src/dsfr-bootstrap/server-only-index';
import { colorSchemeCookieName } from '@etabli/src/utils/color-scheme';

export interface RootLayoutProps {
  workaroundForNextJsPages?: boolean;
}

// [WORKAROUND] `DsfrHead` needs the color scheme registered by this function, even with `workaroundForNextJsPages: true` where `<html>` is not rendered
getHtmlAttributes({ lang: 'fr' });

function MainStructure(props: PropsWithChildren) {
  const nonce = headers().get('x-nonce') || undefined;
  const colorScheme = cookies().get(colorSchemeCookieName)?.value;
  const ssrIsDark = colorScheme === 'dark'; // Without a known color scheme (first visit), the light one like the DSFR provider

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <DsfrHead nonce={nonce} preloadFonts={['Marianne-Regular', 'Marianne-Medium', 'Marianne-Bold']} />
        {/* The browser renders first with the color scheme used by the server so both match, then switches if it differs (react-dsfr reads it, and its own script in `DsfrHead` sets the default one, so this one comes after) */}
        {/* Browsers hide the nonce value once the page is loaded, that is not a difference to report */}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `window.ssrWasPerformedWithIsDark = ${ssrIsDark};` }} />
      </head>
      <body>
        <DsfrProvider lang="fr" doCheckNonce>
          <StartDsfrOnHydration />
          <ServerColorSchemeProvider isDark={ssrIsDark}>
            <MuiDsfrThemeProvider>
              <Providers nonce={nonce}>
                <SentryClientProvider>
                  <LiveChatProvider>{props.children}</LiveChatProvider>
                </SentryClientProvider>
              </Providers>
            </MuiDsfrThemeProvider>
          </ServerColorSchemeProvider>
          <ColorSchemeCookie />
          <Display />
        </DsfrProvider>
        <Matomo nonce={nonce} />
      </body>
    </>
  );
}

export function RootLayout(props: PropsWithChildren<RootLayoutProps>) {
  if (props.workaroundForNextJsPages === true) {
    // When embedded through a server-side only page (for errors for example) `<html>` and `<body>`
    // are already included by Next.js (the browser can ajust the structure but in our case `<html>` duplication
    // throws a visible error in development so we avoid it (it does not change things that much since it's only specific pages))
    return <MainStructure {...props} />;
  }

  return (
    <html lang="fr" {...getHtmlAttributes({ lang: 'fr' })}>
      <MainStructure {...props} />
    </html>
  );
}

export default RootLayout;
