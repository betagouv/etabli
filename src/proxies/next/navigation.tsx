import { notFound as real_notFound } from 'next/navigation';

import { ErrorPage, error404Props } from '@etabli/src/components/ErrorPage';
import { areMocksGloballyEnabled } from '@etabli/src/utils/environment';

// The real `notFound` returns never but it prevents us from displaying an error page
type NotFound = () => never | JSX.Element;

const mock_notFound: NotFound = function () {
  console.log(`"notFound" mock has been called`);

  // Outside Next.js we cannot overrides all the parent components content to just display the error
  // so we consider `notFound()` has been called at a page level so we don't bring a layout too otherwise there would be a possible duplication
  return (
    <ErrorPage
      {...error404Props}
      description={() => (
        <>
          This comes from a mocked &quot;notFound&quot; call so we did our best to match the final result that should be displayed in a Next.js
          application (correct layouts...).
        </>
      )}
    />
  );
};

export const notFound: NotFound = areMocksGloballyEnabled() ? mock_notFound : real_notFound;
