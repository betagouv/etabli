import superjson from 'superjson';

import { appRouter } from '@etabli/src/server/app-router';
import { createContext } from '@etabli/src/server/context';
import { createTRPCNextLayout } from '@etabli/src/server/trpc-next-layout';

export const rsc = createTRPCNextLayout({
  router: appRouter,
  transformer: superjson,
  createContext() {
    return createContext({
      type: 'rsc',
    });
  },
});
