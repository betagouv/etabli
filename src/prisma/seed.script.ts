import dotenv from 'dotenv';
import path from 'path';

import { prisma } from '@etabli/prisma';
import { seedDatabase } from '@etabli/prisma/seed';

// This script always targets the local test database
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

seedDatabase(prisma)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
