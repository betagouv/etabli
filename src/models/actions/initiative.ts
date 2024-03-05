import z from 'zod';

import { GetterInputSchema } from '@etabli/src/models/actions/common';
import { InitiativeSchema } from '@etabli/src/models/entities/initiative';

export const GetInitiativeSchema = z
  .object({
    id: InitiativeSchema.shape.id,
  })
  .strict();
export type GetInitiativeSchemaType = z.infer<typeof GetInitiativeSchema>;

export const ListInitiativesSchema = GetterInputSchema.extend({
  filterBy: z.object({
    query: z.string().nullable(),
  }),
}).strict();
export type ListInitiativesSchemaType = z.infer<typeof ListInitiativesSchema>;

export const ListInitiativesPrefillSchema = ListInitiativesSchema.deepPartial();
export type ListInitiativesPrefillSchemaType = z.infer<typeof ListInitiativesPrefillSchema>;
