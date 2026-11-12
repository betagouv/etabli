/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { getRelatedInitiativeMainAddress } from '@etabli/src/utils/related-initiatives';

const base = { id: 'a', name: 'Label bas carbone', description: '', websites: [] as string[], repositories: [] as string[] };

describe('getRelatedInitiativeMainAddress()', () => {
  it('should give the main website first', () => {
    expect(
      getRelatedInitiativeMainAddress({ ...base, websites: ['https://www.a.fr/', 'https://b.fr'], repositories: ['https://github.com/x/y'] })
    ).toBe('a.fr');
  });

  it('should give the main repository when there is no website', () => {
    expect(getRelatedInitiativeMainAddress({ ...base, repositories: ['https://github.com/betagouv/etabli', 'https://gitlab.com/x/z'] })).toBe(
      'github.com/betagouv/etabli'
    );
  });

  it('should not repeat the address used as name', () => {
    expect(
      getRelatedInitiativeMainAddress({ ...base, name: 'www.consultation.ecologie.gouv.fr', websites: ['https://consultation.ecologie.gouv.fr'] })
    ).toBeNull();
    expect(getRelatedInitiativeMainAddress(base)).toBeNull();
  });
});
