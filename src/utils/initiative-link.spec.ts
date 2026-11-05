/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import {
  formatInitiativeMetaDescription,
  formatInitiativePageTitle,
  getInitiativePathname,
  slugifyInitiativeName,
  withInitiativeSlug,
} from '@etabli/src/utils/initiative-link';

describe('slugifyInitiativeName()', () => {
  it('should keep only lowercase letters, digits and dashes', () => {
    expect(slugifyInitiativeName('Mairie de Saint-Étienne-du-Grès (13)')).toBe('mairie-de-saint-etienne-du-gres-13');
    expect(slugifyInitiativeName("L'Œuvre « numérique » !")).toBe('l-uvre-numerique');
  });

  it('should be empty when nothing readable remains', () => {
    expect(slugifyInitiativeName('« — »')).toBe('');
    expect(withInitiativeSlug('/initiative/abc', '« — »')).toBe('/initiative/abc');
  });

  it('should be limited without ending on a dash', () => {
    const slug = slugifyInitiativeName(`${'a'.repeat(79)} b`);

    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('should append the name to the address', () => {
    expect(getInitiativePathname('abc', 'Annuaire des entreprises')).toBe('/initiative/abc/annuaire-des-entreprises');
  });
});

describe('formatInitiativeMetaDescription()', () => {
  it('should keep a short description as is', () => {
    expect(formatInitiativeMetaDescription(' Un  site\nde la mairie. ')).toBe('Un site de la mairie.');
  });

  it('should cut a long description on a word', () => {
    const description = formatInitiativeMetaDescription(`${'Le service permet de déclarer, '.repeat(10)}fin`);

    expect(description.length).toBeLessThanOrEqual(155);
    expect(description.endsWith('…')).toBe(true);
    expect(description).not.toMatch(/,…$/);
  });
});

describe('formatInitiativePageTitle()', () => {
  it('should mention the organization only when there is a single one', () => {
    expect(formatInitiativePageTitle('Bours.fr', ['Commune de Bours'])).toBe('Bours.fr (Commune de Bours)');
    expect(formatInitiativePageTitle('Bours.fr', ['Commune de Bours', 'Département'])).toBe('Bours.fr');
    expect(formatInitiativePageTitle('Bours.fr', [])).toBe('Bours.fr');
    expect(formatInitiativePageTitle('Commune de Bours', ['commune de bours'])).toBe('Commune de Bours');
  });
});
