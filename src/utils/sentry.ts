import type { ClientOptions } from '@sentry/core';

// An empty DSN will disable Sentry
// We want it to be enabled only when deployed
export const dsn = process.env.NODE_ENV === 'production' ? process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN : undefined;

export const environment = process.env.NEXT_PUBLIC_APP_MODE;

// During runtime this must match the value from the build so there is a connection to uploaded source maps
// The following will be overriden by an hardcoded value as wanted thanks to Next.js `env` property
export const release = process.env.SENTRY_RELEASE_TAG;

// To have the same behavior on frontend and backend
export const beforeSend: ClientOptions['beforeSend'] = (event, hint) => {
  // For whatever reason in production Sentry is by default recording the request body going to Next.js endpoints (`pages/api` folder)
  // ... whereas it's not when testing locally. So to prevent this we make sure to mask any input that would be collected
  // Note: did not find a parameter to prevent this easily (only for their client in .NET or Python)
  if (!!event.request?.data) {
    event.request.data = '[masked]';
  }

  return event;
};
