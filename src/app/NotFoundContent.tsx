'use client';

import { PublicLayout } from '@etabli/src/app/(public)/PublicLayout';
import { ErrorPage, error404Props } from '@etabli/src/components/ErrorPage';

export function NotFoundContent() {
  return (
    <PublicLayout>
      <ErrorPage {...error404Props} />
    </PublicLayout>
  );
}
