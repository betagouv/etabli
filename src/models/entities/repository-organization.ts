import z from 'zod';

export const LiteRepositoryOrganizationSchema = z
  .object({
    url: z.string().url(),
    entities: z.array(z.string().min(1).max(500)),
  })
  .strict();
export type LiteRepositoryOrganizationSchemaType = z.infer<typeof LiteRepositoryOrganizationSchema>;
