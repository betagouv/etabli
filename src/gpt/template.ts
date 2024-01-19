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
