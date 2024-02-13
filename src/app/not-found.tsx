'use client';

import { PublicLayout } from '@etabli/src/app/(public)/PublicLayout';
import { ErrorPage, error404Props } from '@etabli/src/components/ErrorPage';

export function Error404({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <>
      <PublicLayout>
        <ErrorPage {...error404Props} />
      </PublicLayout>
    </>
  );
}

export default Error404;
