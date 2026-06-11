import * as Sentry from '@sentry/nextjs';
import { Pool } from 'pg';

// Clever Cloud serves PostgreSQL behind a self-signed certificate, so we force `sslmode=no-verify`
// (otherwise some clients throw `SELF_SIGNED_CERT_IN_CHAIN`. Note that since Prisma v7
// the `sslmode=prefer` value is no longer accepted, so the deployment is expected to provide `sslmode=no-verify`
const databaseUrl = (process.env.DATABASE_URL || '').replace('sslmode=prefer', 'sslmode=no-verify');

declare global {
  var dbPool: Pool | undefined;
}

export const dbPool =
  global.dbPool ||
  new Pool({
    connectionString: databaseUrl,
    max: Number(process.env.DATABASE_POOL_MAX || 12),
    connectionTimeoutMillis: 10_000, // fail fast instead of waiting forever (was the `pg` default of `0`)
    idleTimeoutMillis: 30_000, // close idle connections ourselves before the server silently drops them
    keepAlive: true, // keep TCP alive to survive idle-connection killers in front of the database
  });

dbPool.on('error', (error) => {
  console.error(error);

  Sentry.captureException(error);
});

if (process.env.NODE_ENV !== 'production') global.dbPool = dbPool;
