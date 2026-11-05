import z from 'zod';

// Used to compare the DILA directory with what is stored, so only the meaningful properties are listed
export const LiteOrganizationSchema = z
  .object({
    dilaId: z.string().uuid(),
    parentDilaId: z.string().uuid().nullable(),
    ancestorDilaIds: z.array(z.string().uuid()),
    level: z.number().int().positive(),
    name: z.string().min(1),
    acronym: z.string().min(1).nullable(),
    domains: z.array(z.string().min(1)),
    directoryUrl: z.string().url().nullable(),
  })
  .strict();
export type LiteOrganizationSchemaType = z.infer<typeof LiteOrganizationSchema>;

export const LiteRepositoryOrganizationSchema = z
  .object({
    url: z.string().url(),
    dilaId: z.string().uuid().nullable(),
  })
  .strict();
export type LiteRepositoryOrganizationSchemaType = z.infer<typeof LiteRepositoryOrganizationSchema>;

export const OrganizationAncestorSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    acronym: z.string().min(1).nullable(),
  })
  .strict();
export type OrganizationAncestorSchemaType = z.infer<typeof OrganizationAncestorSchema>;

// What the frontend gets for an organization bound to an initiative
export const InitiativeOrganizationSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    acronym: z.string().min(1).nullable(),
    level: z.number().int().positive(),
    directoryUrl: z.string().url().nullable(),
    ancestors: z.array(OrganizationAncestorSchema), // From the root to the direct parent
  })
  .strict();
export type InitiativeOrganizationSchemaType = z.infer<typeof InitiativeOrganizationSchema>;

// What the frontend gets when searching an organization to filter initiatives
export const OrganizationOptionSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    acronym: z.string().min(1).nullable(),
    level: z.number().int().positive(),
    initiativesCount: z.number().int().nonnegative(),
    ancestors: z.array(OrganizationAncestorSchema),
  })
  .strict();
export type OrganizationOptionSchemaType = z.infer<typeof OrganizationOptionSchema>;

export const OrganizationNodeSchema = OrganizationOptionSchema.extend({
  hasChildren: z.boolean(), // Whether some children have initiatives (to be expanded)
}).strict();
export type OrganizationNodeSchemaType = z.infer<typeof OrganizationNodeSchema>;

// Initiatives are split by what they are made of, since a website and a repository do not tell the same about usage
export const InitiativesCompositionSchema = z
  .object({
    websitesOnly: z.number().int().nonnegative(),
    repositoriesOnly: z.number().int().nonnegative(),
    both: z.number().int().nonnegative(),
  })
  .strict();
export type InitiativesCompositionSchemaType = z.infer<typeof InitiativesCompositionSchema>;

export const OrganizationsMapItemSchema = z
  .object({
    id: z.string().uuid(),
    parentId: z.string().uuid().nullable(),
    name: z.string().min(1),
    acronym: z.string().min(1).nullable(),
    level: z.number().int().positive(),
    initiativesCount: z.number().int().nonnegative(), // Distinct initiatives of the whole subtree
    own: InitiativesCompositionSchema, // Initiatives directly bound to this organization
  })
  .strict();
export type OrganizationsMapItemSchemaType = z.infer<typeof OrganizationsMapItemSchema>;
