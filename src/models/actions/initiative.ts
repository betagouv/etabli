import z from 'zod';

import { GetterInputSchema } from '@etabli/src/models/actions/common';
import { FunctionalUseCaseSchema, InitiativeSchema } from '@etabli/src/models/entities/initiative';

export const GetInitiativeSchema = z
  .object({
    id: InitiativeSchema.shape.id,
  })
  .strict();
export type GetInitiativeSchemaType = z.infer<typeof GetInitiativeSchema>;

export const ListInitiativesSchema = GetterInputSchema.extend({
  filterBy: z.object({
    query: z.string().nullable(),
    functionalUseCases: z.array(FunctionalUseCaseSchema).optional(),
    toolIds: z.array(z.string().uuid()).optional(),
    hasWebsite: z.boolean().optional(),
    hasRepository: z.boolean().optional(),
    organizationIds: z.array(z.string().uuid()).optional(), // An initiative matches if bound to one of these organizations or to any of their descendants
    unclassified: z.boolean().optional(), // Initiatives bound to no organization (alternative to `organizationIds`)
  }),
}).strict();
export type ListInitiativesSchemaType = z.infer<typeof ListInitiativesSchema>;

export const ListInitiativesPrefillSchema = ListInitiativesSchema.deepPartial();
export type ListInitiativesPrefillSchemaType = z.infer<typeof ListInitiativesPrefillSchema>;

export const SearchOrganizationsSchema = z
  .object({
    query: z.string().max(200).nullable(),
  })
  .strict();
export type SearchOrganizationsSchemaType = z.infer<typeof SearchOrganizationsSchema>;

export const GetOrganizationsSchema = z
  .object({
    ids: z.array(z.string().uuid()).max(50),
  })
  .strict();
export type GetOrganizationsSchemaType = z.infer<typeof GetOrganizationsSchema>;

// The virtual node grouping organizations that are not part of the directory hierarchy (town halls, local offices...)
export const standaloneOrganizationsNodeId = 'standalone';

export const ListOrganizationChildrenSchema = z
  .object({
    parentId: z.string().uuid().or(z.literal(standaloneOrganizationsNodeId)).nullable(), // `null` for the top of the tree
    offset: z.number().int().nonnegative().max(100_000).default(0),
  })
  .strict();
export type ListOrganizationChildrenSchemaType = z.infer<typeof ListOrganizationChildrenSchema>;
