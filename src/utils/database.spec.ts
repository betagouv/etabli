/**
 * @jest-environment node
 */
// Note: the Prisma schema must be compiled when importing, that's why we added the `test:prepare` and `lint:prepare` steps
import { PrismaPg } from '@prisma/adapter-pg';
import concurrently from 'concurrently';

import { PrismaClient } from '@etabli/src/generated/prisma/client';
import { seedDatabase } from '@etabli/src/prisma/seed';
import { PostgresContainer, setupPostgres } from '@etabli/src/utils/database';

describe('database', () => {
  let postgres: PostgresContainer;
  let prisma: PrismaClient;

  beforeAll(async () => {
    postgres = await setupPostgres();

    process.env.DATABASE_URL = postgres.url;
    prisma = new PrismaClient({ adapter: new PrismaPg(postgres.url) });

    // Enable required extensions since not doing a proper "db:migration:deploy" below
    await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS "vector";`;
    await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`;
    await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`;
  }, 30 * 1000);

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }

    if (postgres) {
      await postgres.container.stop();
    }
  }, 30 * 1000);

  describe('prisma', () => {
    it('check schema', async () => {
      const { result } = concurrently(['npm:db:schema:check:unsecure']);

      await result;
    });

    it(
      'migrate',
      async () => {
        const { result } = concurrently(['npm:db:push:unsecure']);

        await result;
      },
      15 * 1000
    );

    it('seed', async () => {
      await seedDatabase(prisma);

      const initiativesCount = await prisma.initiative.count();

      // TODO: for now no seed data
      expect(initiativesCount).toBe(0);
    });
  });
});
