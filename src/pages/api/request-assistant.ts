import { EventEmitter } from 'eventemitter3';
import { NextApiRequest, NextApiResponse } from 'next';

import { ChunkEventEmitter, llmManagerInstance } from '@etabli/src/features/llm';
import { RequestAssistantSchema } from '@etabli/src/models/actions/assistant';
import { prisma } from '@etabli/src/prisma/client';
import { apiHandlerWrapper } from '@etabli/src/utils/api';

// This has been implemented since tRPC does not manage stream responses
export async function handler(req: NextApiRequest, res: NextApiResponse) {
  const input = RequestAssistantSchema.parse(req.body);

  const settings = await prisma.settings.findUniqueOrThrow({
    where: {
      onlyTrueAsId: true,
    },
  });

  await llmManagerInstance.assertInitiativesDocumentsAreReady(settings);

  const requestEventEmitter: ChunkEventEmitter = new EventEmitter<'chunk', number>();
  try {
    // Stream the answer being generated until completed
    requestEventEmitter.on('chunk', (chunk) => {
      res.write(chunk);
    });

    // TODO: check quotas... but it depends on tokens, so maybe inside the underlying call?
    const assistantAnswer = await llmManagerInstance.requestAssistant(settings, input.sessionId, input.message, requestEventEmitter);

    res.end();
  } catch (error) {
    console.log(`an error has occured will reaching the assistant`);
    console.log(error);

    throw error;
  } finally {
    requestEventEmitter.removeAllListeners();
  }
}

export default apiHandlerWrapper(handler, {
  restrictMethods: ['POST'],
});
