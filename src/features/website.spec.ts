import { guessWebsiteNameFromPageTitles } from '@etabli/features/website';

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
