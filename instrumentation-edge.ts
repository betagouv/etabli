import type { Integration } from '@sentry/core';
import * as Sentry from '@sentry/nextjs';

import { beforeSend, dsn, environment, release } from '@etabli/src/utils/sentry';

const integrations: Integration[] = [];

Sentry.init({
  dsn: dsn,
  environment: environment,
  debug: false,
  release: release,
  integrations,
  beforeSend: beforeSend,
});
