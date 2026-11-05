/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { assertPublicHost, isPublicAddress, privateAddressErrorCode } from '@etabli/src/utils/public-address';

describe('isPublicAddress()', () => {
  it('should reject private, loopback and link-local addresses', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '172.20.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
    ]) {
      expect(isPublicAddress(address)).toBe(false);
    }
  });

  it('should accept public addresses', () => {
    for (const address of ['185.11.125.117', '8.8.8.8', '2001:4860:4860::8888', '::ffff:8.8.8.8']) {
      expect(isPublicAddress(address)).toBe(true);
    }
  });
});

describe('assertPublicHost()', () => {
  it('should throw a network-like error for a private literal address', async () => {
    await expect(assertPublicHost('127.0.0.1')).rejects.toMatchObject({ code: privateAddressErrorCode });
  });
});
