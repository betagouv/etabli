// What can be seen from the outside of a website, it says nothing about what its backend calls (e.g. a bucket configured at runtime),
// and a provider is only considered from its nationality since a company outside the EU stays subject to its laws wherever its servers are
export const foreignDependencyLevels = [
  { value: 0, label: 'Aucune détectée' },
  { value: 1, label: 'Faible' }, // Code hosted elsewhere (including the repositories of an initiative)
  { value: 2, label: 'Moyenne' }, // A service seeing visitors (fonts, captcha, analytics...), emails, a CDN, or a hosting in a close country
  { value: 3, label: 'Forte' }, // Hosting
] as const;

export const maximumForeignDependencyLevel = 3;

export function getForeignDependencyLevelLabel(level: number | null): string | null {
  return foreignDependencyLevels.find((item) => item.value === level)?.label ?? null;
}

// European Economic Area, `EU` being declared by some networks, and French overseas territories that have their own code
const europeanCountries = new Set(
  'AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IS IT LI LT LU LV MT NL NO PL PT RO SE SI SK EU GF GP MQ RE YT NC PF PM WF BL MF TF'.split(' ')
);

// Outside the EU, but with a European adequacy decision, so a lower exposure than other countries
const closeCountries = new Set(['CH', 'CA']);

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

// Visitors are exposed to these services as soon as the page loads
const thirdPartyServiceHosts = [
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
  ['hotjar.com', 'Hotjar'],
  ['twitter.com', 'X'],
  ['x.com', 'X'],
  ['linkedin.com', 'LinkedIn'],
  ['licdn.com', 'LinkedIn'],
  ['tiktok.com', 'TikTok'],
  ['yandex.ru', 'Yandex'],
  ['vimeo.com', 'Vimeo'],
  ['hcaptcha.com', 'hCaptcha'],
  ['wp.com', 'Automattic'],
  ['instana.io', 'IBM'],
  ['parastorage.com', 'Wix'],
];

// Mostly open source code that could be served by the website itself
const thirdPartyLibraryHosts = [
  ['amazonaws.com', 'Amazon'],
  ['cloudfront.net', 'Amazon'],
  ['cloudflare.com', 'Cloudflare'],
  ['jsdelivr.net', 'jsDelivr'],
  ['unpkg.com', 'unpkg'],
  ['bootstrapcdn.com', 'BootstrapCDN'],
  ['fontawesome.com', 'Font Awesome'],
  ['jquery.com', 'jQuery'],
  ['polyfill.io', 'Polyfill.io'],
];

function findProvider(host: string, providers: string[][]): string | null {
  return providers.find(([suffix]) => host === suffix || host.endsWith(`.${suffix}`))?.[1] ?? null;
}

// Networks are declared as `CLOUDFLARENET - Cloudflare, Inc.`, `radware Radware Ltd` or `AS12876 Scaleway SAS`
export function cleanNetworkName(name: string | null): string | null {
  if (!name) {
    return null;
  }

  const [handle, ...rest] = name.split(' ');
  const label = name.includes(' - ')
    ? name.slice(name.lastIndexOf(' - ') + 3)
    : rest.length > 0 && (rest.join(' ').toLowerCase().startsWith(handle.toLowerCase()) || /^AS\d+$|-AS\d*$/i.test(handle))
      ? rest.join(' ')
      : name;

  return label.replace(/[,.]?\s+(Inc|LLC|Ltd|SAS|SA|SE|GmbH|S\.A)\.?$/i, '').trim();
}

// Where the code is hosted is visible from the address of a repository, public forges of administrations are not listed
export const foreignRepositoryHosts = ['github.com', 'gitlab.com', 'bitbucket.org'];

export interface SovereigntySignals {
  network: { asn: number; name: string | null; country: string | null } | null;
  cnames: string[];
  mailHosts: string[];
  thirdPartyHosts: string[];
}

export function classifyForeignDependencies(signals: SovereigntySignals): { level: number | null; dependencies: string[] } {
  const hosting = new Set<string>();
  const closeHosting = new Set<string>();
  const cdn = new Set<string>();
  const mail = new Set<string>();
  const services = new Set<string>();
  const libraries = new Set<string>();

  if (signals.network) {
    const { asn, name, country } = signals.network;
    const cdnProvider = cdnNetworks.get(asn);
    const hostingProvider = hostingNetworks.get(asn);

    if (cdnProvider) {
      cdn.add(cdnProvider);
    } else if (hostingProvider) {
      hosting.add(hostingProvider);
    } else if (country && closeCountries.has(country)) {
      closeHosting.add(cleanNetworkName(name) ?? `AS${asn}`);
    } else if (country && !europeanCountries.has(country)) {
      (name && protectionNetworkNames.test(name) ? cdn : hosting).add(cleanNetworkName(name) ?? `AS${asn}`);
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
    const service = findProvider(host, thirdPartyServiceHosts);
    const library = findProvider(host, thirdPartyLibraryHosts);

    if (service) {
      services.add(service);
    } else if (library) {
      libraries.add(library);
    }
  }

  const describe = (label: string, providers: Set<string>) => (providers.size > 0 ? [`${label} : ${[...providers].sort().join(', ')}`] : []);
  const isUnknown = !signals.network && signals.cnames.length === 0 && signals.mailHosts.length === 0 && signals.thirdPartyHosts.length === 0;

  return {
    level: isUnknown
      ? null
      : hosting.size > 0
        ? 3
        : closeHosting.size > 0 || cdn.size > 0 || mail.size > 0 || services.size > 0
          ? 2
          : libraries.size > 0
            ? 1
            : 0,
    dependencies: [
      ...describe('Hébergement', new Set([...hosting, ...closeHosting])),
      ...describe('CDN', cdn),
      ...describe('Messagerie', mail),
      ...describe('Services tiers', services),
      ...describe('Bibliothèques tierces', libraries),
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
