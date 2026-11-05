import { GradeLetterSchemaType } from '@etabli/src/models/entities/initiative';

// From the best to the worst
export const securityGrades = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'E', 'F'];

export function expandGradeLetters(letters: GradeLetterSchemaType[]): string[] {
  return securityGrades.filter((grade) => letters.some((letter) => grade.startsWith(letter)));
}
