import z from 'zod';

export function emptyStringtoNullPreprocessor(initialValidation: z.ZodNullable<z.ZodString>) {
  return z.preprocess((value) => {
    if (value === '') {
      return null;
    }

    return value;
  }, initialValidation);
}
