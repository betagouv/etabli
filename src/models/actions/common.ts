import z from 'zod';

//
// TODO: to implement cursor pagination with Prisma, need to figure out how they define their "cursor" (seems a column?)
// Ref: https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination
//

export const PaginationLimitSchema = z.number().int().positive();
export type PaginationLimitSchemaType = z.infer<typeof PaginationLimitSchema>;

export const PaginationCursorSchema = z.string().min(1);
export type PaginationCursorSchemaType = z.infer<typeof PaginationCursorSchema>;

export const GetterInputSchema = z
  .object({
    // TODO: maybe use "cursor" according to tRPC doc' for "useInfiniteQuery"...
    first: PaginationLimitSchema.nullish(),
    last: PaginationLimitSchema.nullish(),
    before: PaginationCursorSchema.nullish(),
    after: PaginationCursorSchema.nullish(),
    // The following ones should be extended depending on the action
    orderBy: z.object({}),
    filterBy: z.object({}),
  })
  .strict();
export type GetterInputSchemaType = z.infer<typeof GetterInputSchema>;

export const PaginationEdgeSchema = z
  .object({
    edge: z.object({}), // This should be extended with the right entity
    cursor: PaginationCursorSchema,
  })
  .strict();
export type PaginationEdgeSchemaType = z.infer<typeof PaginationEdgeSchema>;

export const PaginationInfoSchema = z
  .object({
    startCursor: PaginationCursorSchema.nullish(),
    endCursor: PaginationCursorSchema.nullish(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  })
  .strict();
export type PaginationInfoSchemaType = z.infer<typeof PaginationInfoSchema>;

export const GetterResponseSchema = z
  .object({
    edges: z.array(PaginationEdgeSchema), // This should be extended with the right entity
    pageInfo: PaginationInfoSchema,
    totalCount: z.number().int().positive(),
  })
  .strict();
export type GetterResponseSchemaType = z.infer<typeof GetterResponseSchema>;
