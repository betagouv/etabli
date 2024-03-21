import * as Sentry from '@sentry/nextjs';

import { beforeSend, dsn, environment, release } from '@etabli/src/utils/sentry';

const integrations: any[] = [];

Sentry.init({
  dsn: dsn,
  environment: environment,
  debug: false,
  release: release,
  autoSessionTracking: true,
  integrations,
  beforeSend: beforeSend,
});
