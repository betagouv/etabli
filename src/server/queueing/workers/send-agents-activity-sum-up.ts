import PgBoss from 'pg-boss';

export const sendAgentsActivitySumUpTopic = 'send-agents-activity-sum-up';

export async function sendAgentsActivitySumUp(job: PgBoss.Job<void>) {
  if (process.env.APP_MODE !== 'prod') {
    console.log('skip the job of sending an activity sum up to all agents to not pollute their inboxes since not in production');
    return;
  }

  // TODO:
}
