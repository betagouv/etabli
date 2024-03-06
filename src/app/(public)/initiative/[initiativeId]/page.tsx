import { Metadata } from 'next';

import { InitiativePage, InitiativePageProps } from '@etabli/src/app/(public)/initiative/[initiativeId]/InitiativePage';
import { prisma } from '@etabli/src/prisma';
import { formatPageTitle } from '@etabli/src/utils/page';

export async function generateMetadata(props: InitiativePageProps): Promise<Metadata> {
  const initiative = await prisma.initiative.findUnique({
    where: {
      id: props.params.initiativeId,
    },
  });

  return {
    title: formatPageTitle(!!initiative ? `${initiative.name} - Initiative` : `Initiative`),
  };
}

export default function Page(props: InitiativePageProps) {
  return <InitiativePage {...props} />;
}
