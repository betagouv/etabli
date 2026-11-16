import { prisma } from '@etabli/src/prisma';
import { seedProductionDataIntoDatabase } from '@etabli/src/prisma/production-seed';

// You need to load the right `DATABASE_URL` environment variable to perform this action
// And to run the script, use from the project root: `npx tsx src/prisma/production-seed.script.ts`
seedProductionDataIntoDatabase(prisma)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
