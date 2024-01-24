import { z } from 'zod';

export const ResultSchema = z.object({
  businessUseCases: z.array(z.string()),
  description: z.string(),
  tools: z.array(z.string()),
  functionalUseCases: z.object({
    hasVirtualEmailInboxes: z.boolean(),
    sendsEmails: z.boolean(),
    generatesPDF: z.boolean(),
  }),
});
export type ResultSchemaType = z.infer<typeof ResultSchema>;

export const resultSample: ResultSchemaType = {
  businessUseCases: [],
  description: '',
  tools: [],
  functionalUseCases: {
    hasVirtualEmailInboxes: false,
    sendsEmails: false,
    generatesPDF: false,
  },
};

export const WebsiteTemplateSchema = z.object({
  deducedTools: z.array(z.string()).nullable(),
  content: z.string(),
});
export type WebsiteTemplateSchemaType = z.infer<typeof WebsiteTemplateSchema>;

export const RepositoryTemplateSchema = z.object({
  functions: z.array(z.string()).nullable(),
  dependencies: z.array(z.string()).nullable(),
  readme: z.string().nullable(),
});
export type RepositoryTemplateSchemaType = z.infer<typeof RepositoryTemplateSchema>;

export const InitiativeTemplateSchema = z.object({
  resultSample: z.string(),
  websites: z.array(WebsiteTemplateSchema),
  repositories: z.array(RepositoryTemplateSchema),
});
export type InitiativeTemplateSchemaType = z.infer<typeof InitiativeTemplateSchema>;

export const DocumentInitiativeTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  websites: z.array(z.string()).nullable(),
  repositories: z.array(z.string()).nullable(),
  businessUseCases: z.array(z.string()).nullable(),
  functionalUseCases: z.array(z.string()).nullable(),
  tools: z.array(z.string()).nullable(),
});
export type DocumentInitiativeTemplateSchemaType = z.infer<typeof DocumentInitiativeTemplateSchema>;

export const DocumentInitiativesChunkTemplateSchema = z.object({
  currentChunkNumber: z.number().nonnegative(),
  chunksTotal: z.number().nonnegative(),
  formattedInitiatives: z.array(z.string()),
});
export type DocumentInitiativesChunkTemplateSchemaType = z.infer<typeof DocumentInitiativesChunkTemplateSchema>;
