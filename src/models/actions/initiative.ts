import z from 'zod';

import { InitiativeSchema } from '@etabli/src/models/entities/initiative';

export const GetInitiativeSchema = z
  .object({
    id: InitiativeSchema.shape.id,
  })
  .strict();
export type GetInitiativeSchemaType = z.infer<typeof GetInitiativeSchema>;
