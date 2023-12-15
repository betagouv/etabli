import { PrismaClient } from '@prisma/client';

import { seedProductionDataIntoDatabase } from '@etabli/prisma/production-seed';

export async function truncateDatabase(prismaClient: PrismaClient) {
  const tablenames = await prismaClient.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

  const tables = tablenames
    .map(({ tablename }) => tablename)
    .filter((name) => name !== '_prisma_migrations')
    .map((name) => `"public"."${name}"`)
    .join(', ');

  try {
    await prismaClient.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
  } catch (error) {
    console.log({ error });
  }
}

export async function seedDatabase(prismaClient: PrismaClient) {
  // Empty all tables to avoid managing upserts+conditions+fixedUuids
  await truncateDatabase(prismaClient);

  // Add predefined production data as samples too
  await seedProductionDataIntoDatabase(prismaClient);

  // TODO
}
