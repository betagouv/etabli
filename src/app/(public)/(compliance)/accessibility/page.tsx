import { Metadata } from 'next';

import { AccessibilityPage } from '@etabli/src/app/(public)/(compliance)/accessibility/AccessibilityPage';
import { formatPageTitle } from '@etabli/src/utils/page';

export const metadata: Metadata = {
  title: formatPageTitle(`Déclaration d'accessibilité`),
};

export default function Page() {
  return <AccessibilityPage />;
}
