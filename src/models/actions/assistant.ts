import z from 'zod';

import { MessageSchema } from '@etabli/src/models/entities/assistant';

export const RequestAssistantSchema = z
  .object({
    sessionId: z.string().uuid(),
    message: MessageSchema.shape.content,
  })
  .strict();
export type RequestAssistantSchemaType = z.infer<typeof RequestAssistantSchema>;

export const RequestAssistantPrefillSchema = RequestAssistantSchema.deepPartial();
export type RequestAssistantPrefillSchemaType = z.infer<typeof RequestAssistantPrefillSchema>;

export const SubscribeAssistantAnswerChunkSchema = z
  .object({
    sessionId: RequestAssistantSchema.shape.sessionId,
  })
  .strict();
export type SubscribeAssistantAnswerChunkSchemaType = z.infer<typeof SubscribeAssistantAnswerChunkSchema>;

export const SubscribeAssistantAnswerChunkPrefillSchema = SubscribeAssistantAnswerChunkSchema.deepPartial();
export type SubscribeAssistantAnswerChunkPrefillSchemaType = z.infer<typeof SubscribeAssistantAnswerChunkPrefillSchema>;
