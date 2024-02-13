'use client';

import { Footer } from '@codegouvfr/react-dsfr/Footer';
import { Header, HeaderProps } from '@codegouvfr/react-dsfr/Header';
import { usePathname } from 'next/navigation';
import { PropsWithChildren } from 'react';

import { ContentWrapper } from '@etabli/src/components/ContentWrapper';
import { FlashMessage } from '@etabli/src/components/FlashMessage';
import { commonFooterAttributes, commonHeaderAttributes } from '@etabli/src/utils/dsfr';
import { linkRegistry } from '@etabli/src/utils/routes/registry';
import { hasPathnameThisMatch } from '@etabli/src/utils/url';

export function PublicLayout(props: PropsWithChildren) {
  const pathname = usePathname();

  let quickAccessItems: HeaderProps.QuickAccessItem[] = [];

  const homeLink = linkRegistry.get('home', undefined);

  return (
    <>
      <Header
        {...commonHeaderAttributes}
        quickAccessItems={quickAccessItems}
        navigation={[
          {
            isActive: hasPathnameThisMatch(pathname, homeLink),
            linkProps: {
              href: homeLink,
              target: '_self',
            },
            text: 'Accueil',
          },
        ]}
      />
      <FlashMessage appMode={process.env.NEXT_PUBLIC_APP_MODE} nodeEnv={process.env.NODE_ENV} />
      <ContentWrapper>{props.children}</ContentWrapper>
      <Footer {...commonFooterAttributes} />
    </>
  );
}
