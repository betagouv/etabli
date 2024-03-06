import Script from 'next/script';

export function Matomo() {
  const matomoUrl = process.env.NEXT_PUBLIC_MATOMO_URL;
  const matomoSiteId = process.env.NEXT_PUBLIC_MATOMO_SITE_ID;

  return process.env.NODE_ENV === 'production' && !!matomoUrl && !!matomoSiteId ? (
    <Script
      id="matomo"
      strategy="afterInteractive"
    >{`var _paq = window._paq = window._paq || [];_paq.push(['trackPageView']);_paq.push(['enableLinkTracking']);(function() {var u="${matomoUrl}";_paq.push(['setTrackerUrl', u+'matomo.php']);_paq.push(['setSiteId', '${matomoSiteId}']);var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0];g.async=true; g.src=u+'matomo.js'; s.parentNode.insertBefore(g,s);})();`}</Script>
  ) : null;
}
