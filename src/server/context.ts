import * as trpc from '@trpc/server';
import * as trpcNext from '@trpc/server/adapters/next';

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
    | (trpcNext.CreateNextContextOptions & { type: 'api' })
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
