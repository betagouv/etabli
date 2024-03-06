import { Metadata } from 'next';

import { ExplorePage } from '@etabli/src/app/(public)/explore/ExplorePage';
import { formatPageTitle } from '@etabli/src/utils/page';

export const metadata: Metadata = {
  title: formatPageTitle(`Explorer`),
};

export default function Page() {
  return <ExplorePage />;
}
