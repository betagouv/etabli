import dotenv from 'dotenv';
import path from 'path';

import { prisma } from '@etabli/src/prisma';
import { seedDatabase } from '@etabli/src/prisma/seed';

const __root_dirname = process.cwd();

// This script always targets the local test database
dotenv.config({ path: path.resolve(__root_dirname, './.env.test') });

seedDatabase(prisma)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
