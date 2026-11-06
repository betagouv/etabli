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
