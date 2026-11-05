import { assistantRouter } from '@etabli/src/server/routers/assistant';
import { initiativeRouter } from '@etabli/src/server/routers/initiative';
import { organizationRouter } from '@etabli/src/server/routers/organization';
import { systemRouter } from '@etabli/src/server/routers/system';
import { mergeRouters } from '@etabli/src/server/trpc';

export const appRouter = mergeRouters(assistantRouter, initiativeRouter, organizationRouter, systemRouter);
export type AppRouter = typeof appRouter;
