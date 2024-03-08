'use client';

import { Footer } from '@codegouvfr/react-dsfr/Footer';
import { Header, HeaderProps } from '@codegouvfr/react-dsfr/Header';
import { PropsWithChildren } from 'react';

import '@etabli/src/app/(public)/layout.scss';
import { ContentWrapper } from '@etabli/src/components/ContentWrapper';
import { FlashMessage } from '@etabli/src/components/FlashMessage';
import { useLiveChat } from '@etabli/src/components/live-chat/useLiveChat';
import { commonFooterAttributes, commonHeaderAttributes } from '@etabli/src/utils/dsfr';
import { linkRegistry } from '@etabli/src/utils/routes/registry';

export function PublicLayout(props: PropsWithChildren) {
  const { showLiveChat, isLiveChatLoading } = useLiveChat();

  let quickAccessItems: HeaderProps.QuickAccessItem[] = [
    {
      iconId: 'fr-icon-home-4-line',
      linkProps: {
        href: linkRegistry.get('home', undefined),
      },
      text: 'Présentation',
    },
    {
      iconId: 'fr-icon-search-line',
      linkProps: {
        href: linkRegistry.get('explore', undefined),
      },
      text: 'Explorer...',
    },
    {
      iconId: 'fr-icon-questionnaire-line',
      buttonProps: {
        onClick: () => {
          showLiveChat();
        },
      },
      text: isLiveChatLoading ? 'Chargement...' : 'Support',
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
