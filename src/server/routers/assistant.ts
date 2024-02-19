import { router } from '@etabli/src/server/trpc';

export const assistantRouter = router({
  // The `requestAssistant` should be here but since tRPC does not manage stream responses we went with a classic Next.js endpoint
});
