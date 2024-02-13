// An empty DSN will disable Sentry
// We want it to be enabled only when deployed
export const dsn = process.env.NODE_ENV === 'production' ? process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN : undefined;

export const environment = process.env.NEXT_PUBLIC_APP_MODE;

// During runtime this must match the value from the build so there is a connection to uploaded source maps
// The following will be overriden by an hardcoded value as wanted thanks to Next.js `env` property
export const release = process.env.SENTRY_RELEASE_TAG;
