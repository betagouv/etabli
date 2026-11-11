import type { Integration } from '@sentry/core';
import * as Sentry from '@sentry/nextjs';

import { beforeSend, dsn, environment, release } from '@etabli/src/utils/sentry';

// Loaded by Next.js in the browser before the application (it replaces the former `sentry.client.config.ts`)

const hasReplays = true;
const integrations: Integration[] = [];

if (hasReplays) {
  integrations.push(
    Sentry.replayIntegration({
      // Browse the app and force a manual error to be able to check the replay record.
      // You may find some elements not hidden and need to use `data-sentry-block` or `data-sentry-mask`.
      // Note: the class is the only way for us to target the Crisp client to keep conversations private.
      maskAllInputs: true,
      block: ['[data-sentry-block]', '.crisp-client'],
      mask: ['[data-sentry-mask]', '.crisp-client'],
    })
  );
}

Sentry.init({
  dsn: dsn,
  environment: environment,
  debug: false,
  release: release,
  integrations,
  replaysSessionSampleRate: 1.0,
  replaysOnErrorSampleRate: 1.0,
  transport: Sentry.makeBrowserOfflineTransport(Sentry.makeFetchTransport),
  transportOptions: {},
  beforeSend: beforeSend,
});

// Required to follow navigations of the App Router
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
