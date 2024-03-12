import { Metadata } from 'next';

import { InitiativePage, InitiativePageProps } from '@etabli/src/app/(public)/initiative/[initiativeId]/InitiativePage';
import { GetInitiativeSchema } from '@etabli/src/models/actions/initiative';
import { prisma } from '@etabli/src/prisma';
import { formatPageTitle } from '@etabli/src/utils/page';

export async function generateMetadata(props: InitiativePageProps): Promise<Metadata> {
  let initiativeName: string | null = null;

  try {
    const initiativeId = GetInitiativeSchema.shape.id.parse(props.params.initiativeId);

    const initiative = await prisma.initiative.findUniqueOrThrow({
      where: {
        id: initiativeId,
      },
    });

    initiativeName = initiative.name;
  } catch (error) {
    // Probably the ID passed is not a valid UUID or existing, we silent the error since it does not change the logic
  }

  return {
    title: formatPageTitle(!!initiativeName ? `${initiativeName} - Initiative` : `Initiative`),
  };
}

export default function Page(props: InitiativePageProps) {
  return <InitiativePage {...props} />;
}
