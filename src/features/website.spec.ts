/**
 * @jest-environment node
 */
import { JSDOM } from 'jsdom';

import { guessWebsiteNameFromPageTitles } from '@etabli/features/website';
import { containsHtml } from '@etabli/utils/html';

describe('guessWebsiteNameFromPageTitles()', () => {
  it('should extract interesting part', async () => {
    const brestTitle1 = 'Mes démarches | Brest métropole';
    const brestTitle2 = 'Accueil | Brest métropole';

    const commonPattern1 = guessWebsiteNameFromPageTitles(brestTitle1, brestTitle2);
    expect(commonPattern1).toBe('Brest métropole');

    const hwTitle1 = 'hello world | Home';
    const hwTitle2 = 'hello world | Contact';

    const commonPattern2 = guessWebsiteNameFromPageTitles(hwTitle1, hwTitle2);
    expect(commonPattern2).toBe('hello world');

    const libraryTitle1 = 'Initial setup - react-dsfr';
    const libraryTitle2 = 'Integration with routing libs - react-dsfr';

    const commonPattern3 = guessWebsiteNameFromPageTitles(libraryTitle1, libraryTitle2);
    expect(commonPattern3).toBe('react-dsfr');
  });

  it('should find no common pattern', async () => {
    const title1 = 'Mes démarches | Brest métropole';
    const title2 = 'Integration with routing libs - react-dsfr';

    const commonPattern = guessWebsiteNameFromPageTitles(title1, title2);
    expect(commonPattern).toBeNull();
  });
});

describe('DOMParser.parseFromString()', () => {
  it('should confirm library cannot detect invalid html', async () => {
    const content = 'raw hello world!';

    const serverJsdom = new JSDOM();
    const parser = new serverJsdom.window.DOMParser();
    const dom = parser.parseFromString(content, 'text/html');

    expect(dom.querySelector('html')?.outerHTML).toBe('<html><head></head><body>raw hello world!</body></html>');

    // So using another check instead
    expect(containsHtml(content)).toBeFalsy();
  });

  it('should confirm relative paths can turn into absolute ones', async () => {
    const content = '<a href="/hello">Hello world!</a>';

    const dom = new JSDOM(content, {
      url: 'https://test.com/',
      contentType: 'text/html',
    });

    expect(dom.window.document.querySelector('a')?.href).toBe('https://test.com/hello');
  });
});
