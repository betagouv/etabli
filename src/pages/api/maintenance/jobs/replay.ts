import { NextApiRequest, NextApiResponse } from 'next';
import { JobWithMetadata } from 'pg-boss';
import { z } from 'zod';

import { BusinessError } from '@etabli/src/models/entities/errors';
import { MaintenanceDataSchemaType, MaintenanceWrapperDataSchema } from '@etabli/src/models/jobs/maintenance';
import { getBossClientInstance } from '@etabli/src/server/queueing/client';
import { updateEntitiesDataTopic } from '@etabli/src/server/queueing/workers/update-entities-data';
import { apiHandlerWrapper } from '@etabli/src/utils/api';
import { assertMaintenanceOperationAuthenticated } from '@etabli/src/utils/maintenance';

export const replayableJobStates: JobWithMetadata['state'][] = ['completed', 'cancelled', 'failed'];

export const HandlerBodySchema = z
  .object({
    jobName: z.string().min(1).default(updateEntitiesDataTopic),
    jobId: z.string().uuid(),
  })
  .strict();
export type HandlerBodySchemaType = z.infer<typeof HandlerBodySchema>;

export async function handler(req: NextApiRequest, res: NextApiResponse) {
  assertMaintenanceOperationAuthenticated(req);

  const body = HandlerBodySchema.parse(req.body);

  const bossClient = await getBossClientInstance();
  const job = await bossClient.getJobById<Record<string, unknown>>(body.jobName, body.jobId);

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

  // Options such as the expiration and the retries are defined by the queue
  const newJobId = await bossClient.send(job.name, dataWithMaintenanceMetadata);

  res.send(`The job has been replayed with the id "${newJobId}"`);
}

export default apiHandlerWrapper(handler, {
  restrictMethods: ['POST'],
});
