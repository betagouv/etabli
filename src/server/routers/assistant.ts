import { observable } from '@trpc/server/observable';
import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';

import { ChunkEventEmitter, llmManagerInstance } from '@etabli/src/features/llm';
import { RequestAssistantSchema, SubscribeAssistantAnswerChunkSchema } from '@etabli/src/models/actions/assistant';
import { MessageAuthorSchema, MessageSchema, SessionAnswerChunkSchema, SessionAnswerChunkSchemaType } from '@etabli/src/models/entities/assistant';
import { prisma } from '@etabli/src/prisma/client';
import { publicProcedure, router } from '@etabli/src/server/trpc';
import { globalAnswerChunkEventEmitter } from '@etabli/src/utils/stream';

export const assistantRouter = router({
  requestAssistant: publicProcedure.input(RequestAssistantSchema).mutation(async ({ ctx, input }) => {
    const settings = await prisma.settings.findUniqueOrThrow({
      where: {
        onlyTrueAsId: true,
      },
    });

    await llmManagerInstance.assertInitiativesDocumentsAreReady(settings);

    const requestEventEmitter: ChunkEventEmitter = new EventEmitter<'chunk', number>();
    const answerMessageId = uuidv4(); // We use message ID to ease the process of gathering chunks on the right UI block
    try {
      // Stream the answer being generated until completed
      requestEventEmitter.on('chunk', (chunk) => {
        globalAnswerChunkEventEmitter.emit(
          'chunk',
          SessionAnswerChunkSchema.parse({
            sessionId: input.sessionId,
            messageId: answerMessageId,
            chunk: chunk,
          })
        );
      });

      // TODO: check quotas... but it depends on tokens, so maybe inside the underlying call?
      const assistantAnswer = await llmManagerInstance.requestAssistant(settings, input.sessionId, input.message, requestEventEmitter);

      return {
        answer: MessageSchema.parse({
          id: answerMessageId,
          author: MessageAuthorSchema.Values.ASSISTANT,
          content: assistantAnswer,
          complete: true,
        }),
      };
    } catch (error) {
      console.log(`an error has occured will reaching the assistant`);
      console.log(error);

      throw error;
    } finally {
      requestEventEmitter.removeAllListeners();
    }
  }),
  subscribeAssistantAnswerChunk: publicProcedure.input(SubscribeAssistantAnswerChunkSchema).subscription(({ ctx, input }) => {
    return observable<SessionAnswerChunkSchemaType>((emit) => {
      const onChunk = (data: SessionAnswerChunkSchemaType) => {
        // If incoming chunks are for the same subscribed session, forward them
        if (data.sessionId === input.sessionId) {
          emit.next(data);
        }
      };

      globalAnswerChunkEventEmitter.on('chunk', onChunk);

      return () => {
        // Client disconnects or stops subscribing, free his listener
        globalAnswerChunkEventEmitter.off('chunk', onChunk);
      };
    });
  }),
});
