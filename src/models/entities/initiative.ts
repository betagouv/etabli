import z from 'zod';

export const LiteInitiativeMapSchema = z
  .object({
    mainItemIdentifier: z.string().uuid(),
    rawDomainsIds: z.array(z.string().uuid()),
    rawRepositoriesIds: z.array(z.string().uuid()),
  })
  .strict();
export type LiteInitiativeMapSchemaType = z.infer<typeof LiteInitiativeMapSchema>;
