import { Metadata } from 'next';

import { InitiativeListPage, InitiativeListPageProps } from '@etabli/src/app/(public)/initiatives/InitiativeListPage';
import { formatPageTitle } from '@etabli/src/utils/page';

export const metadata: Metadata = {
  title: formatPageTitle(`Annuaire des initiatives`),
};

export default function Page(props: InitiativeListPageProps) {
  return <InitiativeListPage {...props} />;
}
