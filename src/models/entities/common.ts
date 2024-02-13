import z from 'zod';

export function emptyStringtoNullPreprocessor(initialValidation: z.ZodNullable<z.ZodString>) {
  // Type is not propagated to this callback
  return z.preprocess((value) => (value === '' ? null : value), initialValidation);
}
