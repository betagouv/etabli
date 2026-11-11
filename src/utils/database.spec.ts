/**
 * @jest-environment node
 */
// Note: the Prisma schema must be compiled when importing, that's why we added the `test:prepare` and `lint:prepare` steps
import concurrently from 'concurrently';

import { seedDatabase } from '@etabli/src/prisma/seed';
import { TestDatabase, setupTestDatabase, teardownTestDatabase } from '@etabli/src/utils/database';

describe('database', () => {
  let database: TestDatabase | null = null;

  beforeAll(async () => {
    // All migrations are applied while setting up, it fails if one of them cannot be
    database = await setupTestDatabase();
  }, 60 * 1000);

  afterAll(async () => {
    await teardownTestDatabase(database);
  }, 30 * 1000);

  describe('prisma', () => {
    it('check schema', async () => {
      const { result } = concurrently(['npm:db:schema:check:unsecure']);

      await result;
    });

    it('migrations match the schema', async () => {
      // The client queries every model, a migration missing a column used by the schema makes it fail
      expect(await database!.prisma.initiative.count()).toBe(0);
      expect(await database!.prisma.organization.count()).toBe(0);
      expect(await database!.prisma.initiativeRedirection.count()).toBe(0);
    });

    it('seed', async () => {
      await seedDatabase(database!.prisma);

      const initiativesCount = await database!.prisma.initiative.count();

      // TODO: for now no seed data
      expect(initiativesCount).toBe(0);
    });
  });
});
