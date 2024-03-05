'use client';

import { InitiativePage, InitiativePageProps } from '@etabli/src/app/(public)/initiative/[initiativeId]/InitiativePage';

export default function Page(props: InitiativePageProps) {
  return <InitiativePage {...props} />;
}
