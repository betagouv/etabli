'use client';

import { createMuiDsfrThemeProvider } from '@codegouvfr/react-dsfr/mui';
import { frFR as coreFrFR } from '@mui/material/locale';
import { frFR as dataGridFrFR } from '@mui/x-data-grid/locales';
import { frFR as datePickerFrFR } from '@mui/x-date-pickers/locales';

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
          defaultProps: {
            arrow: true,
            // On phones a wide tooltip was stuck to both edges of the screen, the positioning keeps it a bit away from them
            slotProps: { popper: { modifiers: [{ name: 'preventOverflow', options: { padding: 8 } }] } },
          },
          styleOverrides: {
            // Its percentages are taken from the visible width of the page, without the scrollbar unlike `100vw` (the tooltip ended under it).
            // It is the margin kept from the edges of the screen
            popper: {
              maxWidth: 'calc(100% - 16px)',
            },
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
        // A collapsed content has no height, but browsers still counted it into the page height (an empty band under the footer
        // with the questions of the home page). Removed from the layout once collapsed, it stays in the HTML for search engines
        MuiCollapse: {
          styleOverrides: {
            hidden: {
              display: 'none',
            },
          },
        },
        // Since MUI X v8 the grid paints its own background, slightly lighter than the page in dark mode where the grey texts no longer
        // reach the contrast ratio. It shows the page background as before
        MuiDataGrid: {
          styleOverrides: {
            root: {
              '--DataGrid-t-color-background-base': 'transparent',
              backgroundColor: 'transparent',
            },
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
