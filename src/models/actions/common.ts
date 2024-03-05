import z from 'zod';

export enum PaginationSize {
  size10 = 10,
  size25 = 25,
  size50 = 50,
}

// Impossible to use an enum with integers, so using the native enum way
export const PaginationSizeSchema = z.nativeEnum(PaginationSize);
export type PaginationSizeSchemaType = z.infer<typeof PaginationSizeSchema>;

export const GetterInputSchema = z
  .object({
    page: z.number().int().positive(),
    pageSize: PaginationSizeSchema,
    // The following ones should be extended depending on the action
    orderBy: z.object({}),
    filterBy: z.object({}),
  })
  .strict();
export type GetterInputSchemaType = z.infer<typeof GetterInputSchema>;

export const GetterResponseSchema = z
  .object({
    items: z.array(z.any()), // This should be extended with the right entity
    totalCount: z.number().int().positive(),
  })
  .strict();
export type GetterResponseSchemaType = z.infer<typeof GetterResponseSchema>;
