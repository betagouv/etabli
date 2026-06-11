import * as Sentry from '@sentry/nextjs';

import { llmManagerInstance } from '@etabli/src/features/llm';
import { programRequestedToShutDownError } from '@etabli/src/models/entities/errors';
import { dbPool } from '@etabli/src/prisma/pool';
import { stopBossClientInstance } from '@etabli/src/server/queueing/client';

export let gracefulExitRequested: boolean = false;

export function watchGracefulExitInLoop() {
  // When the program has to exit this loop helper will make sure long-running is stopped directly
  // So if it has been triggered by an incoming request, so originator is notified
  // Note: it makes sense to only use it into loops having at least an `await` inside, because otherwise since mono-threaded the `gracefulExitRequested` would no be updated before the next `await` in the program
  if (gracefulExitRequested) {
    throw programRequestedToShutDownError;
  }
}

export async function gracefulExit(error?: Error) {
  gracefulExitRequested = true;

  if (error) {
    console.error(error);

    Sentry.captureException(error);
  }

  console.log('Exiting the application gracefully...');

  // Perform any necessary cleanup or finalization tasks here
  try {
    await Promise.all([stopBossClientInstance(), llmManagerInstance.stopHistoryCleaner(), Sentry.close(2000)]);

    // Close the shared pool once pg-boss and any in-flight Prisma query no longer need it
    await dbPool.end();

    console.log('The application has terminated gracefully');
  } finally {
    process.exit(error ? 1 : 0);
  }
}
