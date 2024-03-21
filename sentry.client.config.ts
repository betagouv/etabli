import { Offline as OfflineIntegration } from '@sentry/integrations';
import * as Sentry from '@sentry/nextjs';
import SentryRRWeb from '@sentry/rrweb';

import { beforeSend, dsn, environment, release } from '@etabli/src/utils/sentry';

const hasReplays = true;
const integrations: any[] = [new OfflineIntegration({})];

if (hasReplays) {
  integrations.push(
    new SentryRRWeb({
      // Browse the app and force a manual error to be able to check the rrweb record.
      // You may find some elements not hidden and need to use `data-sentry-block` or `data-sentry-mask`
      maskAllInputs: true,
      blockSelector: '[data-sentry-block]',
      maskTextSelector: '[data-sentry-mask]',
      // We rely only on attribute values to block elements because class is the only way for us to target Crisp client to keep conversations private
      blockClass: 'crisp-client',
      maskTextClass: 'crisp-client',
    })
  );
}

Sentry.init({
  dsn: dsn,
  environment: environment,
  debug: false,
  release: release,
  autoSessionTracking: true,
  integrations,
  beforeSend: beforeSend,
});

// Help to distinguish in the UI an extension resource is available
Sentry.setTag('rrweb.active', hasReplays ? 'yes' : 'no');
