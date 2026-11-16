/**
 * @jest-environment node
 */
import { getDeclaredCanonicalHostname, getDiscardedTwinDomainsIds } from '@etabli/src/utils/twin-domains';

describe('getDeclaredCanonicalHostname()', () => {
  it('should read the canonical link whatever the attributes order', () => {
    expect(getDeclaredCanonicalHostname('<head><link rel="canonical" href="https://WWW.example.fr/accueil"></head>')).toBe('www.example.fr');
    expect(getDeclaredCanonicalHostname(`<link href='http://example.fr/' rel='canonical' />`)).toBe('example.fr');
  });

  it('should fall back on the open graph address', () => {
    expect(getDeclaredCanonicalHostname('<meta property="og:url" content="https://example.fr/" />')).toBe('example.fr');
  });

  it('should return nothing without declaration', () => {
    expect(getDeclaredCanonicalHostname('<link rel="stylesheet" href="https://cdn.example.fr/style.css">')).toBeNull();
  });
});

describe('getDiscardedTwinDomainsIds()', () => {
  const root = { id: 'root', name: 'example.fr', mainSimilarDomainId: null, websiteRawContent: '<html></html>' };
  const www = { id: 'www', name: 'www.example.fr', mainSimilarDomainId: 'root', websiteRawContent: '<html></html>' };

  it('should keep the www address when nothing is declared', () => {
    expect(getDiscardedTwinDomainsIds([root, www])).toEqual(new Set(['root']));
  });

  it('should keep the address declared by the website', () => {
    const declaringWww = { ...www, websiteRawContent: '<link rel="canonical" href="https://example.fr/">' };

    expect(getDiscardedTwinDomainsIds([root, declaringWww])).toEqual(new Set(['www']));
  });

  it('should ignore a declaration targeting another domain', () => {
    const declaringOther = { ...www, websiteRawContent: '<link rel="canonical" href="https://www.other.fr/">' };

    expect(getDiscardedTwinDomainsIds([root, declaringOther])).toEqual(new Set(['root']));
  });

  it('should keep both when they are not linked as the same website', () => {
    expect(getDiscardedTwinDomainsIds([root, { ...www, mainSimilarDomainId: null }])).toEqual(new Set());
  });

  it('should keep a lone domain', () => {
    expect(getDiscardedTwinDomainsIds([www, { ...root, id: 'other', name: 'other.fr' }])).toEqual(new Set());
  });
});
