import PgBoss from 'pg-boss';

export const cleanPendingUploadsTopic = 'clean-pending-uploads';

export async function cleanPendingUploads(job: PgBoss.Job<void>) {
  // TODO:
}
