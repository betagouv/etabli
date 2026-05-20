import path from 'node:path';
import { defineConfig } from 'prisma/config';

const placeholderUrl = 'postgresql://placeholder:placeholder@localhost:5432/placeholder';

export default defineConfig({
  schema: path.join('src', 'prisma', 'schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL ?? placeholderUrl,
  },
  migrations: {
    path: path.join('src', 'prisma', 'migrations'),
    seed: 'tsx --tsconfig ./tsx-fallback.json src/prisma/seed.script.ts',
  },
});
