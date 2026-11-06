// What can be seen from the outside of a website, it says nothing about what its backend calls (e.g. a bucket configured at runtime),
// and a provider is only considered from its nationality since a company outside the EU stays subject to its laws wherever its servers are
export const foreignDependencyLevels = [
  { value: 0, label: 'Aucune détectée' },
  { value: 1, label: 'Faible' }, // Third party scripts or fonts
  { value: 2, label: 'Moyenne' }, // Emails or a CDN in front of the website
  { value: 3, label: 'Forte' }, // Hosting
] as const;

export const maximumForeignDependencyLevel = 3;

export function getForeignDependencyLevelLabel(level: number | null): string | null {
  return foreignDependencyLevels.find((item) => item.value === level)?.label ?? null;
}

const europeanCountries = new Set(
  'AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IS IT LI LT LU LV MT NL NO PL PT RO SE SI SK'.split(' ') // European Economic Area
);

const cdnNetworks = new Map([
  [13335, 'Cloudflare'],
  [209242, 'Cloudflare'],
  [54113, 'Fastly'],
  [20940, 'Akamai'],
  [16625, 'Akamai'],
]);

// Protection services are in front of the website like a CDN, the real hosting stays unknown
const protectionNetworkNames = /incapsula|imperva|radware|sucuri|stackpath/i;

// The name declared by a network is rarely readable
const hostingNetworks = new Map([
  [16509, 'Amazon'],
  [14618, 'Amazon'],
  [8075, 'Microsoft'],
  [15169, 'Google'],
  [396982, 'Google'],
  [14061, 'DigitalOcean'],
  [31898, 'Oracle'],
  [63949, 'Akamai (Linode)'],
]);

const cdnHosts = [
  ['cloudflare.net', 'Cloudflare'],
  ['cloudfront.net', 'Amazon'],
  ['fastly.net', 'Fastly'],
  ['akamaiedge.net', 'Akamai'],
  ['edgekey.net', 'Akamai'],
  ['edgesuite.net', 'Akamai'],
  ['azureedge.net', 'Microsoft'],
  ['azurefd.net', 'Microsoft'],
];

const hostingHosts = [
  ['amazonaws.com', 'Amazon'],
  ['azurewebsites.net', 'Microsoft'],
  ['web.app', 'Google'],
  ['github.io', 'GitHub'],
  ['gitlab.io', 'GitLab'],
  ['netlify.app', 'Netlify'],
  ['vercel-dns.com', 'Vercel'],
  ['wixdns.net', 'Wix'],
  ['squarespace.com', 'Squarespace'],
  ['shopify.com', 'Shopify'],
];

const mailHosts = [
  ['outlook.com', 'Microsoft'],
  ['google.com', 'Google'],
  ['googlemail.com', 'Google'],
  ['amazonaws.com', 'Amazon'],
  ['mimecast.com', 'Mimecast'],
  ['pphosted.com', 'Proofpoint'],
  ['zoho.com', 'Zoho'],
  ['icloud.com', 'Apple'],
];

const thirdPartyHosts = [
  ['googletagmanager.com', 'Google'],
  ['google-analytics.com', 'Google'],
  ['googleapis.com', 'Google'],
  ['gstatic.com', 'Google'],
  ['google.com', 'Google'],
  ['googlesyndication.com', 'Google'],
  ['doubleclick.net', 'Google'],
  ['youtube.com', 'Google'],
  ['youtube-nocookie.com', 'Google'],
  ['recaptcha.net', 'Google'],
  ['facebook.net', 'Meta'],
  ['facebook.com', 'Meta'],
  ['instagram.com', 'Meta'],
  ['clarity.ms', 'Microsoft'],
  ['bing.com', 'Microsoft'],
  ['typekit.net', 'Adobe'],
  ['amazonaws.com', 'Amazon'],
  ['cloudfront.net', 'Amazon'],
  ['cloudflare.com', 'Cloudflare'],
  ['jsdelivr.net', 'jsDelivr'],
  ['unpkg.com', 'unpkg'],
  ['hotjar.com', 'Hotjar'],
  ['twitter.com', 'X'],
  ['x.com', 'X'],
  ['linkedin.com', 'LinkedIn'],
  ['licdn.com', 'LinkedIn'],
  ['tiktok.com', 'TikTok'],
  ['yandex.ru', 'Yandex'],
  ['vimeo.com', 'Vimeo'],
  ['hcaptcha.com', 'hCaptcha'],
];

function findProvider(host: string, providers: string[][]): string | null {
  return providers.find(([suffix]) => host === suffix || host.endsWith(`.${suffix}`))?.[1] ?? null;
}

export interface SovereigntySignals {
  network: { asn: number; name: string | null; country: string | null } | null;
  cnames: string[];
  mailHosts: string[];
  thirdPartyHosts: string[];
}

export function classifyForeignDependencies(signals: SovereigntySignals): { level: number | null; dependencies: string[] } {
  const hosting = new Set<string>();
  const cdn = new Set<string>();
  const mail = new Set<string>();
  const thirdParties = new Set<string>();

  if (signals.network) {
    const { asn, name, country } = signals.network;
    const cdnProvider = cdnNetworks.get(asn);
    const hostingProvider = hostingNetworks.get(asn);

    if (cdnProvider) {
      cdn.add(cdnProvider);
    } else if (hostingProvider) {
      hosting.add(hostingProvider);
    } else if (country && !europeanCountries.has(country)) {
      (name && protectionNetworkNames.test(name) ? cdn : hosting).add(name ?? `AS${asn}`);
    }
  }

  for (const cname of signals.cnames) {
    const cdnProvider = findProvider(cname, cdnHosts);
    const hostingProvider = findProvider(cname, hostingHosts);

    if (cdnProvider) {
      cdn.add(cdnProvider);
    } else if (hostingProvider) {
      hosting.add(hostingProvider);
    }
  }

  for (const host of signals.mailHosts) {
    const provider = findProvider(host, mailHosts);

    if (provider) {
      mail.add(provider);
    }
  }

  for (const host of signals.thirdPartyHosts) {
    const provider = findProvider(host, thirdPartyHosts);

    if (provider) {
      thirdParties.add(provider);
    }
  }

  const describe = (label: string, providers: Set<string>) => (providers.size > 0 ? [`${label} : ${[...providers].sort().join(', ')}`] : []);
  const isUnknown = !signals.network && signals.cnames.length === 0 && signals.mailHosts.length === 0 && signals.thirdPartyHosts.length === 0;

  return {
    level: isUnknown ? null : hosting.size > 0 ? 3 : cdn.size > 0 || mail.size > 0 ? 2 : thirdParties.size > 0 ? 1 : 0,
    dependencies: [
      ...describe('Hébergement', hosting),
      ...describe('CDN', cdn),
      ...describe('Messagerie', mail),
      ...describe('Scripts et contenus tiers', thirdParties),
    ],
  };
}

export function findExternalHosts(document: Document, domain: string): string[] {
  const hosts = new Set<string>();
  const elements = document.querySelectorAll('script[src], iframe[src], link[rel="stylesheet"][href], link[rel="preload"][href]');

  for (const element of Array.from(elements)) {
    try {
      const url = new URL(element.getAttribute('src') ?? element.getAttribute('href') ?? '', `https://${domain}`);

      if (url.protocol.startsWith('http') && url.hostname !== domain) {
        hosts.add(url.hostname.toLowerCase());
      }
    } catch (error) {
      // Nothing to learn from an invalid address
    }
  }

  return [...hosts].sort();
}
