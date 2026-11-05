/**
 * @jest-environment node
 */
import { detectWebsiteProtection } from '@etabli/src/features/website-protection';

const page = { status: 200, headers: {}, title: 'Mairie de Plouhinec', html: '<html><body>Bienvenue</body></html>' };

describe('detectWebsiteProtection()', () => {
  it('should not consider a normal page or a missing one as protected', () => {
    expect(detectWebsiteProtection(page)).toBeNull();
    expect(detectWebsiteProtection({ ...page, status: 404 })).toBeNull();
    expect(detectWebsiteProtection({ ...page, status: 500 })).toBeNull();
  });

  it('should detect a challenge even with a success status', () => {
    expect(detectWebsiteProtection({ ...page, title: 'Just a moment...' })).toBe('cloudflare');
    expect(detectWebsiteProtection({ ...page, html: '<script src="/cdn-cgi/challenge-platform/h/g/orchestrate"></script>' })).toBe('cloudflare');
    expect(detectWebsiteProtection({ ...page, html: '<script src="https://ct.captcha-delivery.com/c.js"></script>' })).toBe('datadome');
    expect(detectWebsiteProtection({ ...page, title: "Making sure you're not a bot!" })).toBe('anubis');
  });

  it('should identify services from their headers', () => {
    expect(detectWebsiteProtection({ ...page, status: 403, headers: { 'cf-mitigated': 'challenge' } })).toBe('cloudflare');
    expect(detectWebsiteProtection({ ...page, status: 403, headers: { server: 'AkamaiGHost' } })).toBe('akamai');
  });

  it('should keep any refused access for a later attempt', () => {
    expect(detectWebsiteProtection({ ...page, status: 403 })).toBe('unknown');
    expect(detectWebsiteProtection({ ...page, status: 429 })).toBe('unknown');
  });
});
