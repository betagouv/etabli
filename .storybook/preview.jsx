import { DsfrHead } from '@codegouvfr/react-dsfr/next-appdir/DsfrHead';
import { DsfrProvider } from '@codegouvfr/react-dsfr/next-appdir/DsfrProvider';
import { getHtmlAttributes } from '@codegouvfr/react-dsfr/next-appdir/getHtmlAttributes';
import { withLinks } from '@storybook/addon-links';
import { configure as testingConfigure } from '@storybook/testing-library';
import { themes } from '@storybook/theming';
import { initialize, mswDecorator } from 'msw-storybook-addon';
import React, { useEffect } from 'react';

import { ThemedDocsContainer } from '@etabli/.storybook/ThemedDocsContainer';
// import { DARK_MODE_EVENT_NAME, UPDATE_DARK_MODE_EVENT_NAME } from 'storybook-dark-mode';
import { disableGlobalDsfrStyle } from '@etabli/.storybook/helpers';
import '@etabli/.storybook/layout.scss';
import { withDisablingTestRunner } from '@etabli/.storybook/testing';
import { MuiDsfrThemeProvider } from '@etabli/src/app/MuiDsfrThemeProvider';
// import { useDarkMode } from 'storybook-dark-mode';
import { StartDsfr } from '@etabli/src/app/StartDsfr';
import { Providers } from '@etabli/src/app/providers';
import '@etabli/src/assets/fonts/index.css';
import { i18n } from '@etabli/src/i18n';

// const channel = addons.getChannel();

// [WORKAROUND] Since `react-dsfr` no longer passes the color scheme through `DsfrProvider` and `DsfrHead` we call this function to avoid an assert error
getHtmlAttributes({ defaultColorScheme: 'light' });

if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
    // When using test runners they may inherit from system settings or the dark mode addon
    // which is not wanted. So each test make sure to manually set `light` or `dark` as color scheme.
    // The tricky part is `testing-library` and/or `playwright` have not access to the `jsdom` to manipulate the DOM (and it's not possible to set it up due to Storybook testing logic)
    // so we emulate a media query into the testing browser that we listen changes from, like that we can change the theming.
    // Note: we didn't scope it to tests otherwise we should hack a bit to inject a variable into the `window` to read it... but it's unlikely you will change your OS color settings while developing :)
    const newColorScheme = event.matches ? 'dark' : 'light';

    document.documentElement.dataset.theme = newColorScheme;
    document.documentElement.dataset.frTheme = newColorScheme;
    document.documentElement.dataset.frScheme = newColorScheme;
  });
}

// Initialize MSW
const mswServerSingleton = initialize({
  onUnhandledRequest: (request, print) => {
    if (request.url.pathname.startsWith('/api/')) {
      // If API calls are not handled it means they are missing handlers for the server mock
      print.error();
    } else {
      // Otherwise let XHR library get local files, favicon...
      request.passthrough();
    }
  },
});

// Increase the timeout because when testing (test runners or interactions panel) all async methods like `findBy`
// have 1 second of timeout, this is sometimes too short when there are multiple loadings behind
testingConfigure({ asyncUtilTimeout: 10 * 1000 });

export const parameters = {
  nextjs: {
    appDirectory: true,
  },
  backgrounds: {
    disable: true,
  },
  darkMode: {
    current: 'light',
    stylePreview: true,
    dark: { ...themes.dark },
    light: { ...themes.light },
  },
  docs: {
    container: (props) => {
      // const [isDark, setDark] = React.useState();

      //
      // TODO: `channel` not available for now since upgrade to Storybook v7
      //

      // const onChangeHandler = () => {
      //   channel.emit(UPDATE_DARK_MODE_EVENT_NAME);
      // };

      // React.useEffect(() => {
      //   channel.on(DARK_MODE_EVENT_NAME, setDark);
      //   return () => channel.removeListener(DARK_MODE_EVENT_NAME, setDark);
      // }, [channel, setDark]);

      return (
        <div>
          {/* <input type="checkbox" onChange={onChangeHandler} /> */}
          <ThemedDocsContainer {...props} />
        </div>
      );
    },
  },
  a11y: {
    config: {
      rules: [
        {
          // TODO: for now the user avatar background color is generated with a simple algorithm but does not respect the ratio
          id: 'color-contrast',
          selector: '*:not(.MuiAvatar-circular.UserAvatar)',
        },
        {
          // A layout footer button targets a theming modal that we do not render to keep things simple, ignore this button violation
          id: 'aria-valid-attr-value',
          selector: '*:not([aria-controls="fr-theme-modal"])',
        },
        {
          // When using the `DataGrid` it says: "Element has children which are not allowed"
          // whereas it has `role="rowgroup"` as direct nested elements... it seems a false-positive so ignoring it
          // (multiple posts on internet mentions this wrong trigger)
          id: 'aria-required-children',
          selector: '*:not(.MuiDataGrid-root)',
        },
        {
          // Cannot add the missign piece triggering the error
          id: 'scrollable-region-focusable',
          selector: '*:not(.MuiDataGrid-virtualScroller)',
        },
        {
          // `react-dsfr` uses the same id for desktop and mobile for their quick access items
          id: 'duplicate-id-active',
          selector: '*:not([id^="fr-header-quick-access-item"])',
        },
      ],
    },
  },
};

export const decorators = [
  withLinks,
  mswDecorator,
  (Story, context) => {
    // Provide the necessary depending on the context

    const { locale } = context.globals;

    // When the locale global changes set the new locale in i18n
    useEffect(() => {
      i18n.changeLanguage(locale);
    }, [locale]);

    disableGlobalDsfrStyle(false); // Workaround for global style leaking

    // We provide the client provider to mock tRPC calls
    return (
      <>
        <StartDsfr />
        <DsfrHead />
        <DsfrProvider>
          <MuiDsfrThemeProvider>
            <Providers>
              <Story />
            </Providers>
          </MuiDsfrThemeProvider>
        </DsfrProvider>
      </>
    );
  },
  withDisablingTestRunner, // This must be the latest to avoid other decorators to be called
];

// TODO: it appears as selected even if default... which is weird (ref: https://github.com/storybookjs/storybook/issues/20009)
export const globalTypes = {
  locale: {
    name: 'Locale',
    description: 'Internationalization locale',
    defaultValue: 'fr',
    // toolbar: {
    //   icon: 'globe',
    //   items: [{ value: 'fr', right: '🇫🇷', title: 'Français' }],
    //   showName: false,
    // },
  },
};
