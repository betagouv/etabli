/**
 * @jest-environment node
 */
import { detectCustomTechnologies, hasOnlyRedirections, isSameDomainRedirection } from '@etabli/src/features/domain-inventory';

describe('isSameDomainRedirection()', () => {
  it('should accept another path or subdomain of the same domain', () => {
    expect(isSameDomainRedirection('https://www.example.fr', 'https://www.example.fr/accueil')).toBe(true);
    expect(isSameDomainRedirection('https://example.fr', 'https://www.example.fr/')).toBe(true);
  });

  it('should refuse another domain and the same address', () => {
    expect(isSameDomainRedirection('https://example.fr', 'https://example.com/')).toBe(false);
    expect(isSameDomainRedirection('https://example.fr', 'https://example.fr/')).toBe(false);
  });
});

describe('hasOnlyRedirections()', () => {
  it('should tell when nothing has been reached', () => {
    expect(hasOnlyRedirections([{ status: 307 }, { status: 302 }])).toBe(true);
    expect(hasOnlyRedirections([{ status: 302 }, { status: 200 }])).toBe(false);
    expect(hasOnlyRedirections([{ status: 404 }])).toBe(false);
  });
});

describe('detectCustomTechnologies()', () => {
  it('should detect Metabase with its version', () => {
    const html =
      '<title>Metabase</title><script>window.MetabaseBootstrap = {"version":{"date":"2026-09-09","tag":"v0.63.17","hash":"5acf389"}}</script>';

    expect(detectCustomTechnologies(html)).toStrictEqual([
      { technology: 'Metabase', version: '0.63.17', cpe: 'cpe:2.3:a:metabase:metabase:*:*:*:*:*:*:*:*', confidence: 100 },
    ]);
  });

  it('should detect Metabase without any version', () => {
    expect(detectCustomTechnologies('<title>Metabase</title>')[0]).toMatchObject({ technology: 'Metabase', version: null });
  });

  it('should not detect anything on a usual page', () => {
    expect(detectCustomTechnologies('<title>Mairie de Plouhinec</title><p>Les métadonnées de la ville</p>')).toStrictEqual([]);
  });
});
