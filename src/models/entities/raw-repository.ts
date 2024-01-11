import z from 'zod';

export const RawRepositoryPlatformSchema = z.enum(['GITHUB', 'GITLAB']);
export type RawRepositoryPlatformSchemaType = z.infer<typeof RawRepositoryPlatformSchema>;

export const LiteRawRepositorySchema = z
  .object({
    name: z.string().min(1).max(500),
    organizationName: z.string().min(1).max(500),
    platform: RawRepositoryPlatformSchema,
    repositoryUrl: z.string().url(),
    description: z.string().min(1).max(2000).nullable(),
    defaultBranch: z.string().min(1),
    isFork: z.boolean().nullable(),
    isArchived: z.boolean(),
    creationDate: z.date(),
    lastUpdate: z.date(),
    lastModification: z.date(),
    homepage: z.string().url().nullable(),
    starsCount: z.number().nonnegative(),
    forksCount: z.number().nonnegative(),
    license: z.string().nullable(),
    openIssuesCount: z.number().nonnegative(),
    language: z.string().min(1).nullable(),
    topics: z.string().min(1).max(1000).nullable(),
    softwareHeritageExists: z.boolean().nullable(),
    softwareHeritageUrl: z.string().url().nullable(),
  })
  .strict();
export type LiteRawRepositorySchemaType = z.infer<typeof LiteRawRepositorySchema>;
