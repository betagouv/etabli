import z from 'zod';

export const ToolCategorySchema = z.enum([
  'LANGUAGES_AND_FRAMEWORKS',
  'BUILD_TEST_DEPLOY',
  'LIBRARIES',
  'DATA_STORES',
  'COLLABORATION',
  'BACK_OFFICE',
  'ANALYTICS',
  'APPLICATION_HOSTING',
  'APPLICATION_UTILITIES',
  'ASSETS_AND_MEDIA',
  'SUPPORT_SALES_AND_MARKETING',
  'DESIGN',
  'MONITORING',
  'PAYMENTS',
  'COMMUNICATIONS',
  'MOBILE',
]);
export type ToolCategorySchemaType = z.infer<typeof ToolCategorySchema>;

export const LiteToolSchema = z
  .object({
    name: z.string().min(1).max(100),
    title: z.string().min(1).max(300).nullable(),
    description: z.string().min(1).max(2000).nullable(),
    category: ToolCategorySchema,
  })
  .strict();
export type LiteToolSchemaType = z.infer<typeof LiteToolSchema>;
