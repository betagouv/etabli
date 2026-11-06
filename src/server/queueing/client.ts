import * as Sentry from '@sentry/nextjs';
import { Job, PgBoss } from 'pg-boss';

import { BusinessError } from '@etabli/src/models/entities/errors';
import { dbPool } from '@etabli/src/prisma/pool';
import { updateEntitiesData, updateEntitiesDataTopic } from '@etabli/src/server/queueing/workers/update-entities-data';
import { gracefulExit } from '@etabli/src/server/system';

declare global {
  var bossClient: PgBoss | undefined;
}

// Make it unique singleton across Next.js module compilations
export let bossClient =
  global.bossClient ||
  new PgBoss({
    db: {
      executeSql: async (text, values) => {
        // `pg` types `rowCount` as `number | null` while pg-boss expects a plain `number`, and for a multi-statement query it
        // returns an array of results at runtime that pg-boss handles by itself
        return (await dbPool.query(text, values)) as unknown as { rows: any[]; rowCount: number };
      },
    },
  });
if (process.env.NODE_ENV !== 'production') global.bossClient = bossClient;

// [WORKAROUND] The event emitter generics of `pg-boss` are not understood with our version of the Node.js types
(bossClient as unknown as NodeJS.EventEmitter).on('error', (error: unknown) => {
  // This error catcher is just for internal operations on pb-boss (fetching, maintenance...)
  // `onComplete` is the proper way to watch job errors
  console.error(error);

  Sentry.captureException(error);
});

let initPromise: Promise<void> | null = null;

// We force using a singleton getter because if `.start()` is not called before doing any operation it will
// fail silently without doing/throwing anything (we also start listening for events before pushing them)
export async function getBossClientInstance(): Promise<PgBoss> {
  if (!initPromise) {
    initPromise = (async () => {
      await bossClient.start();

      // Bind listeners
      await bossClient.createQueue(updateEntitiesDataTopic, {
        policy: 'exclusive', // The data update takes hours, a scheduled occurrence must not start while the previous one is still running
        retryLimit: 0, // A failure is reported, the next scheduled occurrence takes back from what remains to be done
        expireInSeconds: 24 * 60 * 60, // Maximum allowed. When exceeded the job is marked as failed but the worker waits for the handler to return
        deleteAfterSeconds: 45 * 24 * 60 * 60, // Give some time before cleaning archives so an issue can be investigated
      });

      await bossClient.work(
        updateEntitiesDataTopic,
        { pollingIntervalSeconds: 30 }, // No need to check more often for new jobs
        handlerWrapper(updateEntitiesData)
      );
    })();
  }

  // `await` is done outside the condition in case of concurrent init
  try {
    await initPromise;
  } catch (error) {
    gracefulExit(error as unknown as Error);
  }

  return bossClient;
}

export async function stopBossClientInstance(): Promise<void> {
  if (initPromise) {
    await bossClient.stop();
  }
}

export function handlerWrapper<ReqData>(handler: (job: Job<ReqData>) => Promise<void>): (jobs: Job<ReqData>[]) => Promise<void> {
  return async (jobs: Job<ReqData>[]) => {
    for (const job of jobs) {
      try {
        await handler(job);
      } catch (error) {
        console.error(error);

        // Wrapping to report error is required since there is no working way to watch job changes easily with `pg-boss`
        // Ref: https://github.com/timgit/pg-boss/issues/273#issuecomment-1788162895
        if (!(error instanceof BusinessError)) {
          Sentry.withScope(function (scope) {
            // Gather retry errors for the same event at the same place in Sentry
            scope.setFingerprint(['pgboss', job.id]);

            Sentry.captureException(error);
          });
        }

        // Forward the error so pg-boss handles the error correctly
        throw error;
      }
    }
  };
}
