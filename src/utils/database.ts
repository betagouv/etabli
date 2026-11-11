import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import fs from 'fs/promises';
import path from 'path';
import { PrismaPGlite } from 'pglite-prisma-adapter';

import { PrismaClient } from '@etabli/src/generated/prisma/client';

const migrationsDirectory = path.resolve(process.cwd(), './src/prisma/migrations');

export interface TestDatabase {
  db: PGlite;
  prisma: PrismaClient;
}

// A real Postgres compiled to WebAssembly and run in memory: no Docker is needed and each suite gets its own database.
// The migrations themselves are applied (not a schema push) so they are tested too, with the extensions they rely on.
// Note: there is a single session, so concurrent transactions are queued instead of competing
export async function setupTestDatabase(): Promise<TestDatabase> {
  const db = await PGlite.create({
    extensions: { vector, uuid_ossp, pgcrypto, unaccent, pg_trgm },
  });

  const migrations = (await fs.readdir(migrationsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const migration of migrations) {
    try {
      await db.exec(await fs.readFile(path.resolve(migrationsDirectory, migration, 'migration.sql'), 'utf-8'));
    } catch (error) {
      throw new Error(`the migration "${migration}" cannot be applied: ${(error as Error).message}`);
    }
  }

  const prisma = new PrismaClient({ adapter: new PrismaPGlite(db) });

  return { db, prisma };
}

export async function teardownTestDatabase(database: TestDatabase | null): Promise<void> {
  await database?.prisma.$disconnect();
  await database?.db.close();
}
