'use client';

import superjson from 'superjson';

import { createHydrateClient } from '@etabli/src/server/trpc-next-layout';

export const HydrateClient = createHydrateClient({
  transformer: superjson,
});
