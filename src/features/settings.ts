import { prisma } from '@etabli/prisma';

export async function initSettingsIfNeeded() {
  const settings = await prisma.settings.findUnique({
    where: {
      onlyTrueAsId: true,
    },
  });

  if (!settings) {
    await prisma.settings.create({
      data: {
        onlyTrueAsId: true,
      },
    });

    console.log(`the global settings entry has been created into the database`);
  }
}
