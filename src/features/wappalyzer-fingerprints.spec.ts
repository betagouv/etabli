/**
 * @jest-environment node
 */
import { fixFingerprints } from '@etabli/src/features/wappalyzer-fingerprints';

describe('fixFingerprints()', () => {
  it('should not confuse Matomo with Piwik PRO anymore', () => {
    const fixed = fixFingerprints({
      'Piwik PRO Core': { excludes: ['Matomo Analytics'], scriptSrc: ['\\.piwik\\.pro/'], scripts: ['piwik'] },
      Other: { scripts: ['other'] },
    });

    expect(fixed['Piwik PRO Core']).toStrictEqual({ excludes: ['Matomo Analytics'], scriptSrc: ['\\.piwik\\.pro/'] });
    expect(fixed['Other']).toStrictEqual({ scripts: ['other'] });
  });
});
