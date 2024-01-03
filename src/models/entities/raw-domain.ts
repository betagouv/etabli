import z from 'zod';

export const RawDomainTypeSchema = z.enum([
  'COMMUNE',
  'PUBLIC_INTERCOMMUNAL_COOPERATION_ESTABLISHMENT',
  'COLLECTIVITY',
  'REGIONAL_COUNCIL',
  'LIBRARY',
  'MANAGEMENT_CENTER',
  'EDUCATIONAL_INSTITUTION',
  'DEPARTMENTAL_COUNCIL',
  'UNIVERSITY',
  'EMBASSY',
  'ACADEMY',
  'DEPARTMENTAL_AUTONOMY_HOUSE',
  'HOSPITAL',
  'GOVERNMENT',
  'PREFECTURE',
  'HEALTH',
]);
export type RawDomainTypeSchemaType = z.infer<typeof RawDomainTypeSchema>;

export const LiteRawDomainSchema = z
  .object({
    name: z.string().min(1).max(500), // The name corresponds to the hostname of the domain `hello.aaa.com` in case of `http://hello.aaa.com:443/`
    siren: z.string(),
    type: RawDomainTypeSchema.nullable(),
    sources: z.string(),
  })
  .strict();
export type LiteRawDomainSchemaType = z.infer<typeof LiteRawDomainSchema>;
