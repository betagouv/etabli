import { DsfrHeadBase, type DsfrHeadProps, createGetHtmlAttributes } from '@codegouvfr/react-dsfr/next-app-router/server-only-index';
import Link from 'next/link';

import { defaultColorScheme } from '@etabli/src/utils/dsfr';

// Server part of the react-dsfr integration for the app router
export const { getHtmlAttributes } = createGetHtmlAttributes({ defaultColorScheme });

export function DsfrHead(props: DsfrHeadProps) {
  return <DsfrHeadBase Link={Link} {...props} />;
}
