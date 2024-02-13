import { prisma } from '@etabli/src/prisma';
import { seedProductionDataIntoDatabase } from '@etabli/src/prisma/production-seed';

// You need to load the right `DATABASE_URL` environment variable to perform this action
// And to run the script, use from the `apps/main` directory: `pnpm tsx --tsconfig ../../packages/tsconfig/tsx-fallback.json prisma/production-seed.script.ts`
seedProductionDataIntoDatabase(prisma)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
