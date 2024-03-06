import { Metadata } from 'next';

import { AssistantPage } from '@etabli/src/app/(public)/assistant/AssistantPage';
import { formatPageTitle } from '@etabli/src/utils/page';

export const metadata: Metadata = {
  title: formatPageTitle(`Assistant virtuel`),
};

export default function Page() {
  return <AssistantPage />;
}
