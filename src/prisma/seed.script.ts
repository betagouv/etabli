import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { prisma } from '@etabli/src/prisma';
import { seedDatabase } from '@etabli/src/prisma/seed';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
