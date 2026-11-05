/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { getRootDomain } from '@etabli/src/features/domain-mail-security';

describe('getRootDomain()', () => {
  it('should stop at the organization domain', () => {
    expect(getRootDomain('www.mairie-exemple.fr')).toBe('mairie-exemple.fr');
    expect(getRootDomain('www.impots.gouv.fr')).toBe('impots.gouv.fr');
    expect(getRootDomain('impots.gouv.fr')).toBe('impots.gouv.fr');
  });
});
