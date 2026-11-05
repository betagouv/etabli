/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { expandGradeLetters } from '@etabli/src/utils/security-grade';

describe('expandGradeLetters()', () => {
  it('should bring all variants of a letter', () => {
    expect(expandGradeLetters(['A'])).toEqual(['A+', 'A', 'A-']);
    expect(expandGradeLetters(['F'])).toEqual(['F']);
  });
});
