// Note: the Prisma schema must be compiled when importing, that's why we added the `test:prepare` and `lint:prepare` steps
import { PrismaClient } from '@prisma/client';
import concurrently from 'concurrently';

import { seedDatabase } from '@etabli/src/prisma/seed';
import { PostgresContainer, setupPostgres } from '@etabli/src/utils/database';

describe('database', () => {
  let postgres: PostgresContainer;
  let prisma: PrismaClient;

  beforeAll(async () => {
    postgres = await setupPostgres();

    process.env.DATABASE_URL = postgres.url;
    prisma = new PrismaClient();
  }, 30 * 1000);

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }

    if (postgres) {
      await postgres.container.stop();
    }
  }, 30 * 1000);

  describe('testcontainers', () => {
    it('should be working', () => {
      jest.setTimeout(5 * 1000);
    });
  });

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

      expect(initiativesCount).toBe(1);
    });
  });
});
