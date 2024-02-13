import z from 'zod';

export const InitiativeSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    description: z.string().min(1),
    websites: z.array(z.string().url()),
    repositories: z.array(z.string().url()),
    // TODO: use cases, tools
    createdAt: z.date(),
    updatedAt: z.date(),
    deletedAt: z.date().nullable(),
  })
  .strict();
export type InitiativeSchemaType = z.infer<typeof InitiativeSchema>;

export const LiteInitiativeMapSchema = z
  .object({
    mainItemIdentifier: z.string().uuid(),
    rawDomainsIds: z.array(z.string().uuid()),
    rawRepositoriesIds: z.array(z.string().uuid()),
  })
  .strict();
export type LiteInitiativeMapSchemaType = z.infer<typeof LiteInitiativeMapSchema>;
