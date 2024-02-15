import { EventEmitter } from 'eventemitter3';

import { ChunkEventEmitter, llmManagerInstance } from '@etabli/src/features/llm';
import { SessionAnswerChunkSchemaType } from '@etabli/src/models/entities/assistant';

declare global {
  var globalAnswerChunkEventEmitter: ChunkEventEmitter | null;
}

// This has been a pain to figure it out why there were multiple intantiations...
// Thought at first it was due to me testing with websocket server having a weird handling...
// But it's Next.js that does this in development (ref: https://stackoverflow.com/a/75273986/3608410)
export const globalAnswerChunkEventEmitter = global.globalAnswerChunkEventEmitter || new EventEmitter<'chunk', SessionAnswerChunkSchemaType>();

if (process.env.NODE_ENV !== 'production') global.globalAnswerChunkEventEmitter = globalAnswerChunkEventEmitter;
