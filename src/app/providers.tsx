'use client';

import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { PropsWithChildren, createContext, useContext } from 'react';
import { I18nextProvider } from 'react-i18next';

import { ClientProvider } from '@etabli/src/client/trpcClient';
import { ModalProvider } from '@etabli/src/components/modal/ModalProvider';
import { dateFnsLocales, i18n } from '@etabli/src/i18n';

export const ProvidersContext = createContext({});

// [IMPORTANT] Some providers rely on hooks so we extracted them from here so this can be reused in Storybook without a burden
// Consider `Providers` as something common to both Storybook and the runtime application

export function Providers(props: PropsWithChildren) {
  const {} = useContext(ProvidersContext);

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={dateFnsLocales[i18n.language]}>
      <ClientProvider>
        <I18nextProvider i18n={i18n}>
          <ModalProvider>{props.children}</ModalProvider>
        </I18nextProvider>
      </ClientProvider>
    </LocalizationProvider>
  );
}
