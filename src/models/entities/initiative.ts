import z from 'zod';

export const FunctionalUseCaseSchema = z.enum(['HAS_VIRTUAL_EMAIL_INBOXES', 'SENDS_EMAILS', 'GENERATES_PDF']);
export type FunctionalUseCaseSchemaType = z.infer<typeof FunctionalUseCaseSchema>;

export const InitiativeSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    description: z.string().min(1),
    websites: z.array(z.string().url()),
    repositories: z.array(z.string().url()),
    businessUseCases: z.array(z.string()),
    functionalUseCases: z.array(FunctionalUseCaseSchema),
    tools: z.array(z.string()),
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
