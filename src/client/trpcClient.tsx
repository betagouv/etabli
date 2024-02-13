'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, httpLink, loggerLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import { useState } from 'react';
import superjson from 'superjson';

import type { AppRouter } from '@etabli/src/server/app-router';
import { mockBaseUrl, shouldTargetMock } from '@etabli/src/server/mock/environment';
import { getBaseUrl } from '@etabli/src/utils/url';

export const trpc = createTRPCReact<AppRouter>({
  unstable_overrides: {
    useMutation: {
      async onSuccess(opts) {
        await opts.originalFn();
        await opts.queryClient.invalidateQueries();
      },
    },
  },
});

export function ClientProvider(props: { children: React.ReactNode }) {
  const baseUrl = shouldTargetMock() ? mockBaseUrl : getBaseUrl();

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
          },
        },
      })
  );

  // When using the `msw` mock server it's hard to handle request batching
  // because it uses concatenated GET endpoints. To not complexify we avoid it when mocking
  const appropriateHttpLink = shouldTargetMock()
    ? httpLink({
        url: `${baseUrl}/api/trpc`,
      })
    : httpBatchLink({
        url: `${baseUrl}/api/trpc`,
      });

  const [trpcClient] = useState(() =>
    trpc.createClient({
      transformer: superjson,
      links: [
        loggerLink({
          enabled: (opts) => process.env.NODE_ENV === 'development' || (opts.direction === 'down' && opts.result instanceof Error),
        }),
        appropriateHttpLink,
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
    </trpc.Provider>
  );
}
