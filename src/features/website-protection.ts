export type WebsiteProtection = 'cloudflare' | 'datadome' | 'imperva' | 'akamai' | 'anubis' | 'unknown';

export interface WebsiteProtectionInput {
  status: number;
  headers: Record<string, string>; // Names in lowercase
  title: string | null;
  html: string;
}

const blockingStatuses = [401, 403, 406, 429];

// Tell if what has been received comes from a firewall or an anti-bot service instead of the website, which can happen with a
// success status (it would then be stored as the website content)
export function detectWebsiteProtection({ status, headers, title, html }: WebsiteProtectionInput): WebsiteProtection | null {
  const lowercasedTitle = title?.trim().toLowerCase() ?? '';

  if (
    headers['cf-mitigated'] === 'challenge' ||
    html.includes('/cdn-cgi/challenge-platform/') ||
    lowercasedTitle === 'just a moment...' ||
    lowercasedTitle.includes('attention required! | cloudflare')
  ) {
    return 'cloudflare';
  } else if (html.includes('captcha-delivery.com') || (status !== 200 && headers['x-datadome'] !== undefined)) {
    return 'datadome';
  } else if (html.includes('_Incapsula_Resource') || html.includes('Incapsula incident ID')) {
    return 'imperva';
  } else if (status !== 200 && headers['server']?.toLowerCase().includes('akamaighost')) {
    return 'akamai';
  } else if (lowercasedTitle === "making sure you're not a bot!" || html.includes('anubis_challenge')) {
    return 'anubis';
  } else if (blockingStatuses.includes(status)) {
    return 'unknown';
  }

  return null;
}
