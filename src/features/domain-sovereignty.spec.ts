/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { findIpRange, ipToNumber, parseIpRanges } from '@etabli/src/features/domain-sovereignty';

describe('parseIpRanges() and findIpRange()', () => {
  const ranges = parseIpRanges(
    [
      '52.0.0.0\t52.255.255.255\t16509\tUS\tAMAZON-02',
      '1.0.0.0\t1.0.0.255\t13335\tUS\tCLOUDFLARENET',
      '2.0.0.0\t2.0.0.255\t0\tNone\tNot routed',
      '',
    ].join('\n')
  );

  it('should convert without overflowing on high addresses', () => {
    expect(ipToNumber('255.255.255.255')).toBe(4294967295);
  });

  it('should ignore lines without network', () => {
    expect(ranges.map((range) => range.asn)).toEqual([13335, 16509]);
  });

  it('should find the range of an address', () => {
    expect(findIpRange(ranges, '52.10.0.1')).toMatchObject({ asn: 16509, country: 'US', name: 'AMAZON-02' });
    expect(findIpRange(ranges, '1.0.0.255')?.asn).toBe(13335);
  });

  it('should not find an address out of all ranges', () => {
    expect(findIpRange(ranges, '8.8.8.8')).toBeNull();
  });
});
