import { assistantRouter } from '@etabli/src/server/routers/assistant';
import { initiativeRouter } from '@etabli/src/server/routers/initiative';
import { systemRouter } from '@etabli/src/server/routers/system';
import { mergeRouters } from '@etabli/src/server/trpc';

export const appRouter = mergeRouters(assistantRouter, initiativeRouter, systemRouter);
export type AppRouter = typeof appRouter;
