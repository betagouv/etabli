import { publicProcedure, router } from '@etabli/src/server/trpc';

export const systemRouter = router({
  healthcheck: publicProcedure.query(() => 'OK'),
});
