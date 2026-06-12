import type { Integration } from '@sentry/core';
import * as Sentry from '@sentry/nextjs';

import { beforeSend, dsn, environment, release } from '@etabli/src/utils/sentry';

// [NOTE] On Next 14 we keep this `sentry.client.config.ts` file (the `instrumentation-client.ts` convention requires
// Next 15.3+). The Sentry v9 webpack plugin still picks it up; the only caveat is Turbopack, which we do not use.

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
