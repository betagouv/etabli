import z from 'zod';

// This one has no `.strict()` due to data coming directly from the library
export const LitePeerCertificateSchema = z.object({
  subject: z.any(),
  issuer: z.any(),
  subjectaltname: z.string(),
  infoAccess: z.any(),
  bits: z.number(),
  valid_from: z.string(),
  valid_to: z.string(),
  fingerprint: z.string(),
  serialNumber: z.string(),
});
export type LitePeerCertificateSchemaType = z.infer<typeof LitePeerCertificateSchema>;
