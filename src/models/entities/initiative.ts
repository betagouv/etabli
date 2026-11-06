import z from 'zod';

import { InitiativeOrganizationSchema } from '@etabli/src/models/entities/organization';

export const FunctionalUseCaseSchema = z.enum([
  'HAS_VIRTUAL_EMAIL_INBOXES',
  'SENDS_EMAILS',
  'SENDS_PUSH_NOTIFICATIONS',
  'GENERATES_PDF',
  'GENERATES_SPREADSHEET_FILE',
  'HAS_SEARCH_SYSTEM',
  'HAS_AUTHENTICATION_SYSTEM',
  'PROVIDES_TWO_FACTOR_AUTHENTICATION',
  'MANAGES_FILE_UPLOAD',
  'HAS_PAYMENT_SYSTEM',
  'HAS_SEVERAL_LANGUAGES_AVAILABLE',
  'REPORTS_ANALYTICS',
  'REPORTS_ERRORS',
  'DISPLAYS_CARTOGRAPHY_MAP',
  'USES_ARTIFICIAL_INTELLIGENCE',
  'EXPOSES_API_ENDPOINTS',
]);
export type FunctionalUseCaseSchemaType = z.infer<typeof FunctionalUseCaseSchema>;

const LinksDistributionSchema = z.record(z.string(), z.number().nonnegative()).nullable();

// Reputation of a website according to the links it receives, a null value means the provider did not give it
export const GradeLetterSchema = z.enum(['A', 'B', 'C', 'D', 'E', 'F']);
export type GradeLetterSchemaType = z.infer<typeof GradeLetterSchema>;

export const LegalLinkPresenceSchema = z.enum(['with', 'without']);
export type LegalLinkPresenceSchemaType = z.infer<typeof LegalLinkPresenceSchema>;

export const DomainReputationSchema = z
  .object({
    domain: z.string().min(1),
    rank: z.number().int().nonnegative().nullable(),
    backlinks: z.number().int().nonnegative().nullable(),
    referringPages: z.number().int().nonnegative().nullable(),
    referringDomains: z.number().int().nonnegative().nullable(),
    referringDomainsNofollow: z.number().int().nonnegative().nullable(),
    referringMainDomains: z.number().int().nonnegative().nullable(),
    referringIps: z.number().int().nonnegative().nullable(),
    backlinksSpamScore: z.number().int().nonnegative().nullable(),
    brokenBacklinks: z.number().int().nonnegative().nullable(),
    brokenPages: z.number().int().nonnegative().nullable(),
    firstSeenAt: z.date().nullable(),
    lastCheckAt: z.date(),
    linksSemanticLocations: LinksDistributionSchema,
    linksTypes: LinksDistributionSchema,
    linksPlatformTypes: LinksDistributionSchema,
    linksCountries: LinksDistributionSchema,
    linksTopLevelDomains: LinksDistributionSchema,
    httpSecurityGrade: z.string().min(1).nullable(),
    tlsGrade: z.string().min(1).nullable(),
    hasLegalNotice: z.boolean().nullable(),
    hasPrivacyPolicy: z.boolean().nullable(),
    foreignDependencyLevel: z.number().int().nonnegative().nullable(),
    foreignDependencies: z.array(z.string()),
  })
  .strict();
export type DomainReputationSchemaType = z.infer<typeof DomainReputationSchema>;

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
    organizations: z.array(InitiativeOrganizationSchema),
    reputationRank: z.number().int().nonnegative().nullable(), // From 0 to 100, mainly about its websites
    repositoryStars: z.number().int().nonnegative().nullable(), // Best one of its repositories
    relativeReputation: z.number().int().nonnegative().nullable(), // Percentage of the best score among all initiatives
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

export const DatasetInitiativeSchema = InitiativeSchema.pick({
  id: true,
  name: true,
  description: true,
  websites: true,
  repositories: true,
  businessUseCases: true,
  functionalUseCases: true,
  tools: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  relativeReputation: true,
})
  .extend({
    organizations: z.array(z.string()), // Full paths of bound organizations to stay readable in spreadsheets
  })
  .strict();
export type DatasetInitiativeSchemaType = z.infer<typeof DatasetInitiativeSchema>;
