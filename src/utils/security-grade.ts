import { GradeLetterSchemaType } from '@etabli/src/models/entities/initiative';

// From the best to the worst. `T` (untrusted certificate) and `M` (certificate for another name) come from SSL Labs and are
// worse than `F` for visitors since they get a browser warning
export const securityGrades = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'E', 'F', 'T', 'M'];

export function expandGradeLetters(letters: GradeLetterSchemaType[]): string[] {
  return securityGrades.filter((grade) => letters.some((letter) => grade.startsWith(letter) || (letter === 'F' && ['T', 'M'].includes(grade))));
}

export function getWorstGrade(grades: string[]): string | null {
  const knownGrades = grades.filter((grade) => securityGrades.includes(grade));

  return knownGrades.sort((a, b) => securityGrades.indexOf(b) - securityGrades.indexOf(a))[0] ?? null;
}
