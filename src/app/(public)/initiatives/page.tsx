import { Metadata } from 'next';
import { cookies } from 'next/headers';

import { InitiativeListPage, InitiativeListPageProps } from '@etabli/src/app/(public)/initiatives/InitiativeListPage';
import { HydrateClient } from '@etabli/src/client/HydrateClient';
import { appRouter } from '@etabli/src/server/app-router';
import { createContext } from '@etabli/src/server/context';
import { PrefetchedQuery, serializePrefetchedQueries } from '@etabli/src/server/prefetch';
import { listDisplayCookieName, parseListDisplay } from '@etabli/src/utils/display';
import {
  buildListInitiativesInput,
  defaultDirectoryPageSize,
  getDirectoryOrganizationIds,
  loadDirectoryParams,
} from '@etabli/src/utils/initiatives-directory';
import { formatPageTitle } from '@etabli/src/utils/page';

export const metadata: Metadata = {
  title: formatPageTitle(`Annuaire des initiatives`),
};

export interface InitiativesRoutePageProps extends InitiativeListPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Rendered for each request: the data given to the browser must never come from a page cached for someone else
export const dynamic = 'force-dynamic';

export default async function Page(props: InitiativesRoutePageProps) {
  // The list is fetched by the browser through tRPC, giving it the same results makes the server render the links to the sheets
  // (search engines, no JavaScript) and the browser does not ask for them again. If anything fails here the browser fetches them as before
  let prefetchedState: ReturnType<typeof serializePrefetchedQueries> | null = null;
  try {
    const params = loadDirectoryParams(await props.searchParams);

    // The map is drawn by the browser only, and it is not meant for search engines
    if (params.view !== 'map') {
      const caller = appRouter.createCaller(await createContext({ type: 'rsc' }));
      const organizationIds = getDirectoryOrganizationIds(params.orgs);
      const listInput = buildListInitiativesInput(params, organizationIds, defaultDirectoryPageSize);

      const queries: Promise<PrefetchedQuery>[] = [
        caller.listInitiatives(listInput).then((data) => ({ path: 'listInitiatives', input: listInput, data: data })),
      ];

      // Readable names of active filters
      if (organizationIds.length > 0) {
        const input = { ids: organizationIds };
        queries.push(caller.getOrganizations(input).then((data) => ({ path: 'getOrganizations', input: input, data: data })));
      }
      if (params.tools.length > 0) {
        queries.push(caller.listTools().then((data) => ({ path: 'listTools', input: undefined, data: data })));
      }

      prefetchedState = serializePrefetchedQueries(await Promise.all(queries));
    }
  } catch (error) {
    console.error(error);
  }

  const initialListDisplay = parseListDisplay((await cookies()).get(listDisplayCookieName)?.value);

  return prefetchedState ? (
    <HydrateClient state={prefetchedState as any}>
      <InitiativeListPage initialListDisplay={initialListDisplay} />
    </HydrateClient>
  ) : (
    <InitiativeListPage initialListDisplay={initialListDisplay} />
  );
}
