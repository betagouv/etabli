/**
 * @jest-environment node
 */
import { detectCustomTechnologies } from '@etabli/src/features/domain-inventory';

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
