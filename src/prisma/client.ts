import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '@etabli/src/generated/prisma/client';
import { dbPool } from '@etabli/src/prisma/pool';

declare global {
  var prisma: PrismaClient | undefined;
}

const adapter = new PrismaPg(dbPool);

export const prisma =
  global.prisma ||
  new PrismaClient({
    adapter,
    log: process.env.APP_MODE === 'prod' ? ['error'] : ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') global.prisma = prisma;
