import { assistantRouter } from '@etabli/src/server/routers/assistant';
import { initiativeRouter } from '@etabli/src/server/routers/initiative';
import { mergeRouters } from '@etabli/src/server/trpc';

export const appRouter = mergeRouters(initiativeRouter, assistantRouter);
export type AppRouter = typeof appRouter;
