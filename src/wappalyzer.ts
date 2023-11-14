import { z } from 'zod';

export const TechnologyCategorySchema = z.object({
  id: z.number(),
  slug: z.string(),
  name: z.string(),
});
export type TechnologyCategorySchemaType = z.infer<typeof TechnologyCategorySchema>;

export const TechnologySchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  confidence: z.number(),
  version: z.string().nullable(),
  icon: z.string().nullable(),
  website: z.string().nullable(),
  cpe: z.string().nullable(),
  categories: z.array(TechnologyCategorySchema),
  rootPath: z.boolean().nullish(),
});
export type TechnologySchemaType = z.infer<typeof TechnologySchema>;

export const WappalyzerResultSchema = z.object({
  urls: z.record(
    z.object({
      status: z.number(),
    })
  ),
  technologies: z.array(TechnologySchema),
});
export type WappalyzerResultSchemaType = z.infer<typeof WappalyzerResultSchema>;
