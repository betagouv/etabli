import { z } from 'zod';

export const ResultSchema = z.object({
  businessUseCases: z.array(z.string()),
  description: z.string(),
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
  functionalUseCases: {
    hasVirtualEmailInboxes: false,
    sendsEmails: false,
    generatesPDF: false,
  },
};
