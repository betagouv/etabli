'use client';

import { Footer } from '@codegouvfr/react-dsfr/Footer';
import { Header, HeaderProps } from '@codegouvfr/react-dsfr/Header';
import { PropsWithChildren } from 'react';

import '@etabli/src/app/(public)/layout.scss';
import { ContentWrapper } from '@etabli/src/components/ContentWrapper';
import { FlashMessage } from '@etabli/src/components/FlashMessage';
import { commonFooterAttributes, commonHeaderAttributes } from '@etabli/src/utils/dsfr';

export function PublicLayout(props: PropsWithChildren) {
  let quickAccessItems: HeaderProps.QuickAccessItem[] = [
    {
      iconId: 'fr-icon-home-4-line',
      linkProps: {
        href: '#',
      },
      text: 'Accueil',
    },
    {
      iconId: 'fr-icon-search-line',
      linkProps: {
        href: '#',
      },
      text: 'Explorer...',
    },
  ];

  return (
    <>
      <Header {...commonHeaderAttributes} quickAccessItems={quickAccessItems} navigation={[]} />
      <FlashMessage appMode={process.env.NEXT_PUBLIC_APP_MODE} nodeEnv={process.env.NODE_ENV} />
      <ContentWrapper>{props.children}</ContentWrapper>
      <Footer {...commonFooterAttributes} />
    </>
  );
}
