'use client';

import { Footer } from '@codegouvfr/react-dsfr/Footer';
import { Header, HeaderProps } from '@codegouvfr/react-dsfr/Header';
import { PropsWithChildren } from 'react';

import '@etabli/src/app/(public)/layout.scss';
import { ContentWrapper } from '@etabli/src/components/ContentWrapper';
import { useSingletonExploreModal } from '@etabli/src/components/ExploreModal';
import { useLiveChat } from '@etabli/src/components/live-chat/useLiveChat';
import { commonFooterAttributes, commonHeaderAttributes } from '@etabli/src/utils/dsfr';
import { linkRegistry } from '@etabli/src/utils/routes/registry';

export function PublicLayout(props: PropsWithChildren) {
  const { showLiveChat, isLiveChatLoading } = useLiveChat();
  const { showExploreModal } = useSingletonExploreModal();

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
      buttonProps: {
        onClick: () => {
          showExploreModal();
        },
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
      <ContentWrapper>{props.children}</ContentWrapper>
      <Footer {...commonFooterAttributes} />
    </>
  );
}
