'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createWSClient, httpBatchLink, httpLink, loggerLink, splitLink, wsLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import { useState } from 'react';
import superjson from 'superjson';

import type { AppRouter } from '@etabli/src/server/app-router';
import { mockBaseUrl, shouldTargetMock } from '@etabli/src/server/mock/environment';
import { getBaseUrl, getWsBaseUrl } from '@etabli/src/utils/url';

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
  const targetMock = shouldTargetMock();

  const baseUrl = targetMock ? mockBaseUrl : getBaseUrl();
  const wsBaseUrl = targetMock ? mockBaseUrl : getWsBaseUrl();

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
  const appropriateHttpLink = targetMock
    ? httpLink({
        url: `${baseUrl}/api/trpc`,
      })
    : httpBatchLink({
        url: `${baseUrl}/api/trpc`,
      });

  const appropriateWsLink = targetMock
    ? appropriateHttpLink
    : wsLink({
        client: createWSClient({
          url: wsBaseUrl,
        }),
      });

  const [trpcClient] = useState(() =>
    trpc.createClient({
      transformer: superjson,
      links: [
        loggerLink({
          enabled: (opts) => process.env.NODE_ENV === 'development' || (opts.direction === 'down' && opts.result instanceof Error),
        }),
        // appropriateHttpLink,
        splitLink({
          condition: (op) => {
            if (op.type === 'subscription') {
              if (targetMock) {
                // Since there is no proper way to mock the websocket client locally
                // We make sure to convert subscriptions into mutations while using the normal "link" logic (like that it does nothing and does not trigger errors)
                op.type = 'mutation';
              }

              return true;
            }

            return false;
          },
          true: appropriateWsLink,
          false: appropriateHttpLink,
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
    </trpc.Provider>
  );
}
