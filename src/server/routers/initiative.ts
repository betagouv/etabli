import { GetInitiativeSchema } from '@etabli/src/models/actions/initiative';
import { publicProcedure, router } from '@etabli/src/server/trpc';

export const initiativeRouter = router({
  getInitiative: publicProcedure.input(GetInitiativeSchema).query(async ({ ctx, input }) => {
    // TODO:
  }),
});
