import { EventEmitter } from 'eventemitter3';
import { NextApiRequest, NextApiResponse } from 'next';

import { ChunkEventEmitter, llmManagerInstance } from '@etabli/src/features/llm';
import { RequestAssistantSchema } from '@etabli/src/models/actions/assistant';
import { NetworkStreamChunkSchemaType } from '@etabli/src/models/entities/assistant';
import { responseStreamErrorError } from '@etabli/src/models/entities/errors';
import { prisma } from '@etabli/src/prisma/client';
import { CHUNK_DATA_PREFIX, CHUNK_ERROR_PREFIX, apiHandlerWrapper } from '@etabli/src/utils/api';

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
      const jsonChunk: NetworkStreamChunkSchemaType = { content: chunk };

      // The return carriage is for network visibility, but it will be stripped on the frontend
      // Note: we use the JSON intermediary to encode special character like return carriage so they are mixed with our own protocol logic
      res.write(`${CHUNK_DATA_PREFIX}${JSON.stringify(jsonChunk)}\n`);
    });

    // TODO: check quotas... but it depends on tokens, so maybe inside the underlying call?
    const assistantAnswer = await llmManagerInstance.requestAssistant(settings, input.sessionId, input.message, requestEventEmitter);

    res.end();
  } catch (error) {
    console.log(`an error has occured will reaching the assistant`);
    console.log(error);

    res.write(`${CHUNK_ERROR_PREFIX}${JSON.stringify(responseStreamErrorError.json())}\n`); // Add a new line to have the same decoding logic than for data chunks
    res.end();

    // We still throw the error so the wrapper can perform its additional custom logic
    throw error;
  } finally {
    requestEventEmitter.removeAllListeners();
  }
}

export default apiHandlerWrapper(handler, {
  restrictMethods: ['POST'],
});
