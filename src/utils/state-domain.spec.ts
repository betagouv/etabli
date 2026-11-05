/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { isStateReservedDomain } from '@etabli/src/utils/state-domain';

describe('isStateReservedDomain()', () => {
  it('should accept domains under gouv.fr', () => {
    expect(isStateReservedDomain('impots.gouv.fr')).toBe(true);
    expect(isStateReservedDomain('www.Service-Public.GOUV.fr.')).toBe(true);
  });

  it('should reject look-alike domains', () => {
    expect(isStateReservedDomain('gouv.fr.example.com')).toBe(false);
    expect(isStateReservedDomain('notgouv.fr')).toBe(false);
    expect(isStateReservedDomain('mairie-exemple.fr')).toBe(false);
  });
});
