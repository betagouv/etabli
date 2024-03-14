/**
 * @jest-environment node
 */
import { JSDOM } from 'jsdom';

import { guessWebsiteNameFromPageTitles } from '@etabli/src/features/website';
import { containsHtml } from '@etabli/src/utils/html';

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

    const symbolTitle1 = 'Accueil | Administration+';
    const symbolTitle2 = 'Contact | Administration+';

    const commonPattern4 = guessWebsiteNameFromPageTitles(symbolTitle1, symbolTitle2);
    expect(commonPattern4).toBe('Administration+');

    const longerCommonPatternTitle1 = 'CarbuRe ∙ Authentification';
    const longerCommonPatternTitle2 = 'CarbuRe ∙ Accueil';

    const commonPattern5 = guessWebsiteNameFromPageTitles(longerCommonPatternTitle1, longerCommonPatternTitle2);
    expect(commonPattern5).not.toBe('CarbuRe ∙ A');
    expect(commonPattern5).toBe('CarbuRe');

    const unguessablePatternTitle1 = 'Components / Common / CoordonneesIcone - No Icone ⋅ Storybook';
    const unguessablePatternTitle2 = 'Components / Common / CoordonneesIcone - Icone ⋅ Storybook';

    const commonPattern6 = guessWebsiteNameFromPageTitles(unguessablePatternTitle1, unguessablePatternTitle2);
    expect(commonPattern6).toBeNull();

    const noCommonPatternTitle1 = "Test de l'éclair";
    const noCommonPatternTitle2 = "Appartenance d'une adresse à un quartier prioritaire de l'Auvergne";

    const commonPattern7 = guessWebsiteNameFromPageTitles(noCommonPatternTitle1, noCommonPatternTitle2);
    expect(commonPattern7).toBeNull(); // It should not detect "de l'" as being the common part
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
