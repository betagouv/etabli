/**
 * @jest-environment node
 */
import robotsParser from 'robots-parser';

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
