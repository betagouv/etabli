/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { detectLegalLinks } from '@etabli/src/utils/legal-links';

describe('detectLegalLinks()', () => {
  it('should find them from the text of a link', () => {
    expect(detectLegalLinks([{ text: 'Mentions légales', href: '/page-12' }])).toEqual({ hasLegalNotice: true, hasPrivacyPolicy: false });
    expect(detectLegalLinks([{ text: 'Politique de confidentialité', href: '#' }])).toEqual({ hasLegalNotice: false, hasPrivacyPolicy: true });
    expect(detectLegalLinks([{ text: 'Données personnelles et cookies', href: '/dp' }]).hasPrivacyPolicy).toBeTruthy();
  });

  it('should find them from the url of a link', () => {
    expect(detectLegalLinks([{ text: 'En savoir plus', href: '/fr/mentions-legales.html' }]).hasLegalNotice).toBeTruthy();
    expect(detectLegalLinks([{ text: '', href: 'https://example.fr/legal' }]).hasLegalNotice).toBeTruthy();
    expect(detectLegalLinks([{ text: '', href: '/content/vie_privee' }]).hasPrivacyPolicy).toBeTruthy();
    expect(detectLegalLinks([{ text: '', href: '/?page=mentions-legales' }]).hasLegalNotice).toBeTruthy();
  });

  it('should find both on a single combined page', () => {
    expect(detectLegalLinks([{ text: 'Mentions légales et confidentialité', href: '/ml' }])).toEqual({ hasLegalNotice: true, hasPrivacyPolicy: true });
  });

  it('should not mix url parts nor match close words', () => {
    expect(detectLegalLinks([{ text: 'Galerie', href: '/accueil/galerie' }]).hasLegalNotice).toBeFalsy();
    expect(detectLegalLinks([{ text: 'Mentions', href: '/mentions/legal-aid' }]).hasPrivacyPolicy).toBeFalsy();
    expect(detectLegalLinks([{ text: 'Mairie', href: '/mentions-du-maire' }]).hasLegalNotice).toBeFalsy();
  });

  it('should not fail on an invalid url', () => {
    expect(detectLegalLinks([{ text: 'Mentions légales', href: 'http://[' }]).hasLegalNotice).toBeTruthy();
  });
});
