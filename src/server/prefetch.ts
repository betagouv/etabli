import { QueryClient, dehydrate } from '@tanstack/react-query';
import superjson from 'superjson';

export interface PrefetchedQuery {
  path: string; // As called from the browser, like `getInitiative`
  input: unknown; // Exactly the one given by the browser, otherwise the query would not be found and fetched again
  data: unknown;
}

// Server pages give the data their client components ask through tRPC, so the page is fully rendered by the server (search engines,
// browsers without JavaScript) and browsers find it in their cache instead of asking for it again. To be given to `HydrateClient`
export function serializePrefetchedQueries(queries: PrefetchedQuery[]) {
  const queryClient = new QueryClient();

  for (const query of queries) {
    // Same key as tRPC builds for `useQuery()` (ref: `getArrayQueryKey()` in `@trpc/react-query`)
    queryClient.setQueryData([query.path.split('.'), { input: query.input, type: 'query' }], query.data);
  }

  // Dates and other values not supported by JSON keep their type, as with the tRPC transformer
  return superjson.serialize(dehydrate(queryClient));
}
