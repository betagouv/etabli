import { getBossClientInstance } from '@etabli/src/server/queueing/client';
import { updateEntitiesDataTopic } from '@etabli/src/server/queueing/workers/update-entities-data';

export async function scheduleCronTasks() {
  const bossClient = await getBossClientInstance();

  // Schedule tasks
  // At night to not compete with visitors, and early in the week so someone is around when it finishes to handle a problem
  await bossClient.schedule(updateEntitiesDataTopic, `0 2 * * 1,2,3,4`, undefined, { tz: 'Europe/Paris' }); // Monday to Thursday at 2am
}
