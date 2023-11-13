import { z } from 'zod';

export const PositionSchema = z.object({
  col: z.number(),
  line: z.number(),
  offset: z.number(),
});
export type PositionSchemaType = z.infer<typeof PositionSchema>;

export const SpanSchema = z.object({
  end: PositionSchema,
  file: z.string(),
  start: PositionSchema,
});
export type SpanSchemaType = z.infer<typeof SpanSchema>;

export const ErrorItemSchema = z.object({
  code: z.number(),
  level: z.string(),
  message: z.string(),
  path: z.string(),
  spans: z.array(SpanSchema),
  type: z.tuple([
    z.literal('PartialParsing'),
    z.array(
      z.object({
        end: PositionSchema,
        path: z.string(),
        start: PositionSchema,
      })
    ),
  ]),
});
export type ErrorItemSchemaType = z.infer<typeof ErrorItemSchema>;

export const PathsSchema = z.object({
  scanned: z.array(z.string()),
});
export type PathsSchemaType = z.infer<typeof PathsSchema>;

export const ResultItemSchema = z.object({
  check_id: z.string(),
  end: z.object({
    col: z.number(),
    line: z.number(),
    offset: z.number(),
  }),
  extra: z.object({
    engine_kind: z.string(),
    fingerprint: z.string(),
    is_ignored: z.boolean(),
    lines: z.string(),
    message: z.string(),
    metadata: z.record(z.unknown()),
    metavars: z.record(
      z.object({
        abstract_content: z.string(),
        end: PositionSchema,
        start: PositionSchema,
      })
    ),
    severity: z.string(),
    validation_state: z.string(),
  }),
  path: z.string(),
  start: z.object({
    col: z.number(),
    line: z.number(),
    offset: z.number(),
  }),
});
export type ResultItemSchemaType = z.infer<typeof ResultItemSchema>;

export const SemgrepResultSchema = z.object({
  errors: z.array(ErrorItemSchema),
  paths: PathsSchema,
  results: z.array(ResultItemSchema),
  skipped_rules: z.array(z.unknown()),
  version: z.string(),
});
export type SemgrepResultSchemaType = z.infer<typeof SemgrepResultSchema>;
