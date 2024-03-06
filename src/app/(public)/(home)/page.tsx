import { Metadata } from 'next';

import { HomePage } from '@etabli/src/app/(public)/(home)/HomePage';
import { formatPageTitle } from '@etabli/src/utils/page';

export const metadata: Metadata = {
  title: formatPageTitle(`Présentation`),
};

export default function Page() {
  return <HomePage />;
}
