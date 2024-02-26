import { getBossClientInstance } from '@etabli/src/server/queueing/client';
import { updateEntitiesDataTopic } from '@etabli/src/server/queueing/workers/update-entities-data';

export async function scheduleCronTasks() {
  const bossClient = await getBossClientInstance();

  // Schedule tasks
  await bossClient.schedule(updateEntitiesDataTopic, `0 19 * * 0,3`, undefined, { tz: 'Europe/Paris' }); // Each sunday and wednesday at 7pm since the entire flow can be a bit long, it will run over night
}
