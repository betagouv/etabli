'use client';

import { init, push } from '@socialgouv/matomo-next';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useEffectOnce } from 'react-use';

export interface MatomoProps {
  nonce?: string;
}

// The following is inspired by https://github.com/incubateur-ademe/carte-verte/blob/dev/src/components/utils/Matomo.tsx
// to track page change on Next.js with appDir
export function Matomo(props: MatomoProps) {
  const matomoUrl = process.env.NEXT_PUBLIC_MATOMO_URL;
  const matomoSiteId = process.env.NEXT_PUBLIC_MATOMO_SITE_ID;
  const isEnabled = process.env.NODE_ENV === 'production';

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [previousPath, setPreviousPath] = useState('');

  useEffectOnce(() => {
    if (!isEnabled || !matomoUrl || !matomoSiteId) {
      return;
    }

    // [WORKAROUND] React renders the component twice making Matomo throwing an error about double configuration
    // So we rely on the shared state across those renderings (happening when developing only)
    const typedWindow = window as unknown as { $matomoInit: boolean };
    if (typedWindow.$matomoInit === true) {
      return;
    }

    init({
      url: matomoUrl,
      siteId: matomoSiteId,
      disableCookies: true,
      nonce: props.nonce,
      onInitialization: () => {
        push(['optUserOut']);
        push(['rememberConsentGiven']); // Needed so `trackEvent` and others work (since we don't push data that identifies the user, no need of a consent)
        push(['forgetCookieConsentGiven']); // Prevent Matomo setting a cookie (or remove if done previously)
        push(['enableHeartBeatTimer']);
        push(['disableQueueRequest']);
        push(['disablePerformanceTracking']);
      },
    });

    typedWindow.$matomoInit = true;
  });

  /* The @socialgouv/matomo-next does not work with next 13 */
  useEffect(() => {
    if (!pathname || !isEnabled) {
      return;
    }

    if (!previousPath) {
      return setPreviousPath(pathname);
    }

    push(['setReferrerUrl', `${previousPath}`]);
    push(['setCustomUrl', pathname]);
    push(['deleteCustomVariables', 'page']);
    push(['deleteCustomVariable', 'page']);

    setPreviousPath(pathname);

    // In order to ensure that the page title had been updated,
    // we delayed pushing the tracking to the next tick.
    setTimeout(() => {
      console.debug('Matomo tracking', { pathname, previousPath });

      push(['setDocumentTitle', document.title]);
      push(['trackPageView']);
    });
    /**
     * This is because we don't want to track previousPath
     * could be a if (previousPath === pathname) return; instead
     * But be sure to not send the tracking twice
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  return <></>;
}
