import z from 'zod';

import { GetterInputSchema } from '@etabli/src/models/actions/common';
import {
  FunctionalUseCaseSchema,
  GradeLetterSchema,
  InitiativeSchema,
  IssueLevelSchema,
  LegalLinkPresenceSchema,
} from '@etabli/src/models/entities/initiative';
import { ToolCategorySchema } from '@etabli/src/models/entities/tool';

export const GetInitiativeSchema = z
  .object({
    id: InitiativeSchema.shape.id,
  })
  .strict();
export type GetInitiativeSchemaType = z.infer<typeof GetInitiativeSchema>;

// Same limit when filtering and when retrieving the selected organizations to display them
export const maximumFilteredOrganizations = 50;

// The listing is public and each criterion ends in costly queries (full-text, trigram, embedding), so inputs are bounded
export const maximumSearchQueryLength = 200;
export const maximumFilteredTools = 50;
export const maximumListPage = 10_000;
const maximumEnumFilterItems = 20; // Only a few values exist, it only prevents repeating them

export const InitiativesOrderSchema = z.enum(['relevance', 'name', 'reputation']);
export type InitiativesOrderSchemaType = z.infer<typeof InitiativesOrderSchema>;

export const ListInitiativesSchema = GetterInputSchema.extend({
  page: GetterInputSchema.shape.page.max(maximumListPage),
  orderBy: z.object({
    field: InitiativesOrderSchema.optional(),
  }),
  filterBy: z.object({
    query: z.string().max(maximumSearchQueryLength).nullable(),
    functionalUseCases: z.array(FunctionalUseCaseSchema).max(maximumEnumFilterItems).optional(),
    toolIds: z.array(z.string().uuid()).max(maximumFilteredTools).optional(),
    hasWebsite: z.boolean().optional(),
    hasRepository: z.boolean().optional(),
    organizationIds: z.array(z.string().uuid()).max(maximumFilteredOrganizations).optional(), // An initiative matches if bound to one of these organizations or to any of their descendants
    unclassified: z.boolean().optional(), // Initiatives bound to no organization (alternative to `organizationIds`)
    httpSecurityGrades: z.array(GradeLetterSchema).max(maximumEnumFilterItems).optional(),
    tlsLevels: z.array(IssueLevelSchema).max(maximumEnumFilterItems).optional(),
    mailSecurityLevels: z.array(IssueLevelSchema).max(maximumEnumFilterItems).optional(),
    legalNotice: LegalLinkPresenceSchema.optional(),
    privacyPolicy: LegalLinkPresenceSchema.optional(),
    foreignDependencyLevels: z.array(z.number().int().min(0).max(3)).max(maximumEnumFilterItems).optional(),
  }),
}).strict();
export type ListInitiativesSchemaType = z.infer<typeof ListInitiativesSchema>;

export const ListInitiativesPrefillSchema = ListInitiativesSchema.partial().extend({
  orderBy: ListInitiativesSchema.shape.orderBy.partial().optional(),
  filterBy: ListInitiativesSchema.shape.filterBy.partial().optional(),
});
export type ListInitiativesPrefillSchemaType = z.infer<typeof ListInitiativesPrefillSchema>;

export const SearchOrganizationsSchema = z
  .object({
    query: z.string().max(200).nullable(),
  })
  .strict();
export type SearchOrganizationsSchemaType = z.infer<typeof SearchOrganizationsSchema>;

export const GetOrganizationsSchema = z
  .object({
    ids: z.array(z.string().uuid()).max(maximumFilteredOrganizations),
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

// Parts of the organizations map that are not organizations
export const allInitiativesNodeId = 'all';
export const unclassifiedInitiativesNodeId = 'unclassified';

export const GetToolsBreakdownSchema = z
  .object({
    nodeId: z
      .string()
      .uuid()
      .or(z.enum([allInitiativesNodeId, unclassifiedInitiativesNodeId, standaloneOrganizationsNodeId])),
    category: ToolCategorySchema,
    filterBy: ListInitiativesSchema.shape.filterBy, // Same criteria as the directory
  })
  .strict();
export type GetToolsBreakdownSchemaType = z.infer<typeof GetToolsBreakdownSchema>;

export const GetOrganizationsMapSchema = z
  .object({
    filterBy: ListInitiativesSchema.shape.filterBy, // Same criteria as the directory
  })
  .strict();
export type GetOrganizationsMapSchemaType = z.infer<typeof GetOrganizationsMapSchema>;
