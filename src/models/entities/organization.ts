import z from 'zod';

export const LiteOrganizationSchema = z
  .object({
    dilaId: z.string().uuid(),
    parentDilaId: z.string().uuid().nullable(),
    level: z.number().nonnegative(),
    name: z.string().min(1).max(500),
    domains: z.array(z.string()),
  })
  .strict();
export type LiteOrganizationSchemaType = z.infer<typeof LiteOrganizationSchema>;
