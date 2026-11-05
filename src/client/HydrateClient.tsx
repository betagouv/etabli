'use client';

import superjson from 'superjson';

import { createHydrateClient } from '@etabli/src/server/trpc-next-layout/HydrateClient';

// Not the index, its other helpers rely on Next.js internals that no longer exist

export const HydrateClient = createHydrateClient({
  transformer: superjson,
});
