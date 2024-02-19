import { NextApiRequest, NextApiResponse } from 'next';
import { JobWithMetadata } from 'pg-boss';
import { z } from 'zod';

import { BusinessError } from '@etabli/src/models/entities/errors';
import { MaintenanceDataSchemaType, MaintenanceWrapperDataSchema } from '@etabli/src/models/jobs/maintenance';
import { getBossClientInstance } from '@etabli/src/server/queueing/client';
import { apiHandlerWrapper } from '@etabli/src/utils/api';
import { assertMaintenanceOperationAuthenticated } from '@etabli/src/utils/maintenance';

export const replayableJobStates: JobWithMetadata['state'][] = ['completed', 'expired', 'cancelled', 'failed'];

export const HandlerBodySchema = z
  .object({
    jobId: z.string().uuid(),
  })
  .strict();
export type HandlerBodySchemaType = z.infer<typeof HandlerBodySchema>;

export async function handler(req: NextApiRequest, res: NextApiResponse) {
  assertMaintenanceOperationAuthenticated(req);

  const body = HandlerBodySchema.parse(req.body);

  const bossClient = await getBossClientInstance();
  const job = await bossClient.getJobById(body.jobId);

  if (!job) {
    throw new BusinessError('jobNotFoundWithId', 'no job found with this id');
  } else if (!replayableJobStates.includes(job.state)) {
    throw new BusinessError('jobCannotBeReplayed', 'the job must be in a final state to be replayed');
  }

  const previousMaintenanceWrapperParse = MaintenanceWrapperDataSchema.parse(job.data);

  let currentMaintenance: MaintenanceDataSchemaType;

  if (previousMaintenanceWrapperParse.__maintenance__) {
    currentMaintenance = {
      requestedAt: new Date(),
      originalJobId: previousMaintenanceWrapperParse.__maintenance__.originalJobId,
      replayedMaintenanceJobId: job.id,
    };
  } else {
    currentMaintenance = {
      requestedAt: new Date(),
      originalJobId: job.id,
    };
  }

  const dataWithMaintenanceMetadata = {
    ...job.data,
    ...MaintenanceWrapperDataSchema.parse({
      __maintenance__: currentMaintenance,
    }),
  };

  const newJobId = await bossClient.send(job.name, dataWithMaintenanceMetadata, {
    // The options are not formatted the same way when getting from the database
    // and as input. So we map manually, but only those that make sense, not the absolute dates...
    expireInMinutes: job.expirein.minutes,
    // Even if the following was undefined when passed, it was triggering the error like `configuration assert: expireInHours must be at least every hour`
    // so only keeping `expireInMinutes` for now
    // ---
    // expireInSeconds: job.expirein.seconds,
    // expireInHours: job.expirein.hours,
    retryLimit: job.retrylimit,
    retryDelay: job.retrydelay,
    retryBackoff: job.retrybackoff,
    onComplete: job.oncomplete !== undefined ? job.oncomplete : (job as any).on_complete, // It seems there is a difference between the type and the real property into the job from the database
  });

  res.send(`The job has been replayed with the id "${newJobId}"`);
}

export default apiHandlerWrapper(handler, {
  restrictMethods: ['POST'],
});
