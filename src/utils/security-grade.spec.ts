/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { expandGradeLetters, getWorstGrade } from '@etabli/src/utils/security-grade';

describe('getWorstGrade()', () => {
  it('should return the worst one', () => {
    expect(getWorstGrade(['A+', 'C-', 'B'])).toBe('C-');
    expect(getWorstGrade(['F', 'T'])).toBe('T');
  });

  it('should ignore unknown values', () => {
    expect(getWorstGrade([])).toBeNull();
    expect(getWorstGrade(['?', 'B'])).toBe('B');
  });
});

describe('expandGradeLetters()', () => {
  it('should bring all variants of a letter', () => {
    expect(expandGradeLetters(['A'])).toEqual(['A+', 'A', 'A-']);
  });

  it('should consider a certificate issue as a failure', () => {
    expect(expandGradeLetters(['F'])).toEqual(['F', 'T', 'M']);
  });
});
