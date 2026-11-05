import { PrismaClient } from '@etabli/src/generated/prisma/client';
import { seedProductionDataIntoDatabase } from '@etabli/src/prisma/production-seed';
import { getDatabaseSchema } from '@etabli/src/prisma/schema-name';

export async function truncateDatabase(prismaClient: PrismaClient) {
  const schema = getDatabaseSchema(process.env.DATABASE_URL);
  const tablenames = await prismaClient.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname=${schema}`;

  const tables = tablenames
    .map(({ tablename }) => tablename)
    .filter((name) => name !== '_prisma_migrations')
    .map((name) => `"${schema}"."${name}"`)
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
