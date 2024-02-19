import * as Sentry from '@sentry/nextjs';

import { stopBossClientInstance } from '@etabli/src/server/queueing/client';

export async function gracefulExit(error?: Error) {
  if (error) {
    console.error(error);

    Sentry.captureException(error);
  }

  console.log('Exiting the application gracefully...');

  // Perform any necessary cleanup or finalization tasks here
  try {
    await Promise.all([stopBossClientInstance(), Sentry.close(2000)]);

    console.log('The application has terminated gracefully');
  } finally {
    process.exit(error ? 1 : 0);
  }
}
