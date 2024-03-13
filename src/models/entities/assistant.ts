import z from 'zod';

export const MessageAuthorSchema = z.enum(['USER', 'ASSISTANT']);
export type MessageAuthorSchemaType = z.infer<typeof MessageAuthorSchema>;

export const MessageSchema = z
  .object({
    id: z.string().uuid(),
    author: MessageAuthorSchema,
    content: z.string().min(1).max(4000), // It's unlikely people goes to 4000 chars, but just in case to limit abuse
    complete: z.boolean(),
  })
  .strict();
export type MessageSchemaType = z.infer<typeof MessageSchema>;

export const SessionAnswerChunkSchema = z
  .object({
    sessionId: z.string().uuid(),
    messageId: MessageSchema.shape.id,
    chunk: z.string(),
  })
  .strict();
export type SessionAnswerChunkSchemaType = z.infer<typeof SessionAnswerChunkSchema>;

export const NetworkStreamChunkSchema = z
  .object({
    content: z.string(),
  })
  .strict();
export type NetworkStreamChunkSchemaType = z.infer<typeof NetworkStreamChunkSchema>;
