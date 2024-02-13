import dynamic from 'next/dynamic';

import { ErrorPage, error404Props } from '@etabli/src/components/ErrorPage';

// This is needed because `pages` are designed for server-side only, and it fails compiling some sub-dependencies that are "modules"
const PublicLayout = dynamic(import('@etabli/src/app/(public)/layout'), { ssr: false }); // Async API cannot be server-side rendered
const RootLayout = dynamic(import('@etabli/src/app/layout'), { ssr: false }); // Async API cannot be server-side rendered

// TODO: this can be removed once Next.js manages 404 errors directly in the `app` directory
export function Error404() {
  return (
    <RootLayout workaroundForNextJsPages={true}>
      <PublicLayout>
        <ErrorPage {...error404Props} />
      </PublicLayout>
    </RootLayout>
  );
}

export default Error404;
