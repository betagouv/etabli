'use client';

import { createMuiDsfrThemeProvider } from '@codegouvfr/react-dsfr/mui';
import { frFR as coreFrFR } from '@mui/material/locale';
import { frFR as dataGridFrFR } from '@mui/x-data-grid/locales/frFR';
import { frFR as datePickerFrFR } from '@mui/x-date-pickers/locales/frFR';

export const { MuiDsfrThemeProvider } = createMuiDsfrThemeProvider({
  augmentMuiTheme: ({ nonAugmentedMuiTheme }) => {
    return {
      ...nonAugmentedMuiTheme,
      components: {
        ...nonAugmentedMuiTheme.components,
        // Bring i18n for components like DatePicker
        ...datePickerFrFR.components,
        ...dataGridFrFR.components,
        ...coreFrFR.components,
        // A light tooltip is more readable than the default dark one, and it stays the same everywhere
        MuiTooltip: {
          defaultProps: { arrow: true },
          styleOverrides: {
            // Most pages are as white as the tooltip, so the frame and the shadow are what detach it from the content below
            tooltip: {
              backgroundColor: 'var(--background-overlap-grey)',
              color: 'var(--text-default-grey)',
              border: '1px solid var(--grey-625-425)',
              boxShadow: nonAugmentedMuiTheme.shadows[8],
              maxWidth: 420,
              padding: '10px 14px !important', // The DSFR overrides the tooltip padding
            },
            arrow: {
              color: 'var(--background-overlap-grey)',
              '&::before': { border: '1px solid var(--grey-625-425)' },
            },
          },
        },
        // MUI derives the background by darkening the color a lot in dark mode, it ended darker than the page (a black hole on a grey
        // dialog). The DSFR contrast backgrounds are made for both modes
        MuiAlert: {
          styleOverrides: {
            ...Object.fromEntries(
              (['info', 'success', 'warning', 'error'] as const).map((severity) => [
                `standard${severity.charAt(0).toUpperCase()}${severity.slice(1)}`,
                {
                  backgroundColor: `var(--background-contrast-${severity})`,
                  color: 'var(--text-default-grey)',
                  '& .MuiAlert-icon': { color: `var(--text-default-${severity})` },
                },
              ])
            ),
          },
        },
        MuiDialog: {
          styleOverrides: {
            paper: {
              backgroundImage: `none !important`, // This comes from MUI that overrides the background color
            },
          },
        },
        MuiDialogContent: {
          // TODO: remove once the issue is addressed: https://github.com/mui/material-ui/issues/31185
          styleOverrides: { root: { paddingTop: `1rem !important` } },
        },
      },
    };
  },
});
