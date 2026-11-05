/**
 * @jest-environment node
 */
import { fixFingerprints } from '@etabli/src/features/wappalyzer-fingerprints';

describe('fixFingerprints()', () => {
  it('should not rely on what the code of scripts mentions', () => {
    const fixed = fixFingerprints({
      'Yandex.Metrika': {
        js: { yandex_metrika: '' },
        scriptSrc: ['mc\\.yandex\\.ru/metrika/tag\\.js'],
        scripts: ['mc\\.yandex\\.ru/metrika/tag\\.js'],
      },
      Eskimi: { scripts: ['eskimi\\.com'] },
    });

    expect(fixed['Yandex.Metrika']).toStrictEqual({ js: { yandex_metrika: '' }, scriptSrc: ['mc\\.yandex\\.ru/metrika/tag\\.js'] });
    expect(fixed['Eskimi']).toStrictEqual({});
  });
});
