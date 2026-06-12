import * as Sentry from '@sentry/nextjs';

// Required by the Next.js App Router so server-side errors are forwarded to Sentry (replaces the v7 auto-capture)
export const onRequestError = Sentry.captureRequestError;

export async function register() {
  // Only initialize for deployed environments (the DSN is also gated to production in `utils/sentry.ts`)
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./instrumentation-edge');
  }

  // Note: the browser SDK is initialized from `sentry.client.config.ts` (we are on Next 14, which does not support
  // the `instrumentation-client.ts` file — that one requires Next 15.3+).
}
