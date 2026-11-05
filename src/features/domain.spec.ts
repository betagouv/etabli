/**
 * @jest-environment node
 */
import robotsParser from 'robots-parser';

import { getWwwTwinDomainName } from '@etabli/src/features/domain';

describe('robotsParser.isAllowed()', () => {
  const rootUrl = 'https://example.com/';
  const robotsUrl = 'https://example.com/robots.txt';

  it('should confirm it can be indexed', async () => {
    const body = `
User-agent: *
Allow: /
`;

    const robots = robotsParser(robotsUrl, body);
    const canBeIndexed = robots.isAllowed(rootUrl);

    expect(canBeIndexed).toBeTruthy();
  });

  it('should confirm the library does not look at robots.txt format', async () => {
    const body = `<html></html>`;

    const robots = robotsParser(robotsUrl, body);
    const canBeIndexed = robots.isAllowed(rootUrl);

    // We just need to keep in mind no robots.txt means it's indexable (ref: https://github.com/samclarke/robots-parser/issues/34)
    expect(canBeIndexed).toBeTruthy();
  });
});

describe('getWwwTwinDomainName()', () => {
  it('should return the domain without www', () => {
    expect(getWwwTwinDomainName('www.fretigney.fr')).toBe('fretigney.fr');
    expect(getWwwTwinDomainName('www.service.ville.fr')).toBe('service.ville.fr');
  });

  it('should ignore other domains', () => {
    expect(getWwwTwinDomainName('fretigney.fr')).toBeNull();
    expect(getWwwTwinDomainName('wwwa.fretigney.fr')).toBeNull();
    expect(getWwwTwinDomainName('sub.www.fretigney.fr')).toBeNull();
    expect(getWwwTwinDomainName('www.fr')).toBeNull(); // There is no domain to fallback on
  });
});
