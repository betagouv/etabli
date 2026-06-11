import * as Sentry from '@sentry/nextjs';
import PgBoss from 'pg-boss';

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
        const result = await dbPool.query(text, values);

        // `pg` types `rowCount` as `number | null`, while pg-boss expects a plain `number`
        return { rows: result.rows, rowCount: result.rowCount ?? 0 };
      },
    },
    newJobCheckIntervalSeconds: 30, // No need to check every 2 seconds as set by default to look at new jobs
    deleteAfterDays: 45, // Give some time before cleaning archives so an issue can be investigated without dealing with database backups
  });
if (process.env.NODE_ENV !== 'production') global.bossClient = bossClient;

bossClient.on('error', (error) => {
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
      await bossClient.work(updateEntitiesDataTopic, handlerWrapper(updateEntitiesData));
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

export function handlerWrapper<ReqData>(handler: PgBoss.WorkHandler<ReqData>): PgBoss.WorkHandler<ReqData> {
  return async (job: PgBoss.Job<ReqData>) => {
    try {
      await handler(job);
    } catch (error) {
      console.error(error);

      // Wrapping to report error is required since there is no working way to watch job changes easily with `work()` method
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
  };
}
