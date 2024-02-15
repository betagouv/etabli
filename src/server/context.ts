import * as trpc from '@trpc/server';
import type { CreateNextContextOptions } from '@trpc/server/adapters/next';
import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';

interface CreateContextOptions {
  rsc: boolean;
}

export async function createContextInner(opts: CreateContextOptions) {
  return {
    user: null,
  };
}

export async function createContext(
  opts:
    | {
        type: 'rsc';
      }
    | (CreateNextContextOptions & { type: 'api' })
    | (CreateWSSContextFnOptions & { type: 'api' })
) {
  if (opts.type === 'rsc') {
    // RSC
    return {
      type: opts.type,
    };
  }

  return {
    type: opts.type,
    user: null,
  };
}

export type Context = trpc.inferAsyncReturnType<typeof createContext>;
