/// <reference types="react/canary" />
import { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import { CreativeWork, WithContext } from 'schema-dts';

import { InitiativePage, InitiativePageProps } from '@etabli/src/app/(public)/initiative/[initiativeId]/InitiativePage';
import { HydrateClient } from '@etabli/src/client/HydrateClient';
import { getInitiativeRedirection } from '@etabli/src/features/initiative-redirection';
import { retrieveInitiativesOrganizations } from '@etabli/src/features/organization-read';
import { getServerTranslation } from '@etabli/src/i18n';
import { GetInitiativeSchema } from '@etabli/src/models/actions/initiative';
import { prisma } from '@etabli/src/prisma';
import { appRouter } from '@etabli/src/server/app-router';
import { createContext } from '@etabli/src/server/context';
import { serializePrefetchedQueries } from '@etabli/src/server/prefetch';
import { initiativePrismaToModel } from '@etabli/src/server/routers/mappers';
import {
  formatInitiativeMetaDescription,
  formatInitiativePageTitle,
  getInitiativePathname,
  slugifyInitiativeName,
} from '@etabli/src/utils/initiative-link';
import { serializeJsonLd } from '@etabli/src/utils/json-ld';
import { formatPageTitle } from '@etabli/src/utils/page';
import { maximumRelatedInitiatives } from '@etabli/src/utils/related-initiatives';
import { getBaseUrl } from '@etabli/src/utils/url';

export interface InitiativeRoutePageProps {
  params: Promise<
    InitiativePageProps['params'] & {
      slug?: string[]; // Only the name of the sheet for readers and search engines, it is ignored to find it
    }
  >;
}

// `generateMetadata` and the page are rendered for the same request, React deduplicates these calls between both
const getPageInitiative = cache(async (initiativeId: string) => {
  return await prisma.initiative.findUnique({
    where: {
      id: initiativeId,
    },
    include: {
      ToolsOnInitiatives: {
        include: {
          tool: {
            select: {
              name: true,
            },
          },
        },
      },
      BusinessUseCasesOnInitiatives: {
        include: {
          businessUseCase: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });
});

const getPageInitiativeOrganizations = cache(async (initiativeId: string) => {
  return (await retrieveInitiativesOrganizations([initiativeId])).get(initiativeId) ?? [];
});

export async function generateMetadata(props: InitiativeRoutePageProps): Promise<Metadata> {
  const params = await props.params;
  const idResult = GetInitiativeSchema.shape.id.safeParse(params.initiativeId);
  const initiative = idResult.success ? await getPageInitiative(idResult.data) : null;

  // The page itself redirects or tells it does not exist
  if (!initiative || initiative.deletedAt) {
    return {
      title: formatPageTitle(`Initiative`),
    };
  }

  const organizations = await getPageInitiativeOrganizations(initiative.id);
  const title = formatInitiativePageTitle(
    initiative.name,
    organizations.map((organization) => organization.name)
  );
  const description = formatInitiativeMetaDescription(initiative.description);
  const url = `${getBaseUrl()}${getInitiativePathname(initiative.id, initiative.name)}`;

  return {
    title: formatPageTitle(title),
    description: description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: 'website',
      siteName: 'Établi',
      locale: 'fr_FR',
      title: title,
      description: description,
      url: url,
    },
  };
}

// Rendered for each request: the data given to the browser must never come from a page cached for someone else
export const dynamic = 'force-dynamic';

export default async function Page(props: InitiativeRoutePageProps) {
  const { t } = getServerTranslation('common');
  const params = await props.params;

  const idResult = GetInitiativeSchema.shape.id.safeParse(params.initiativeId);
  if (!idResult.success) {
    return notFound();
  }

  const dbInitiative = await getPageInitiative(idResult.data);

  if (!dbInitiative || dbInitiative.deletedAt) {
    // A removed sheet leads to the one now describing its website or repository, what search engines learnt about it is kept
    const redirection = await getInitiativeRedirection(idResult.data);

    if (redirection) {
      permanentRedirect(getInitiativePathname(redirection.id, redirection.name));
    }

    return notFound();
  } else if ((params.slug ?? []).join('/') !== slugifyInitiativeName(dbInitiative.name)) {
    // A missing, outdated or wrong name in the address leads to the right one so the sheet has a single address
    permanentRedirect(getInitiativePathname(dbInitiative.id, dbInitiative.name));
  }

  // The sheet is fetched by the browser through tRPC, giving it the same data makes the server render it fully (search engines, no JavaScript)
  // and the browser does not ask for it again. If anything fails here the browser simply fetches it as before
  let prefetchedState: ReturnType<typeof serializePrefetchedQueries> | null = null;
  try {
    const caller = appRouter.createCaller(await createContext({ type: 'rsc' }));
    const input = { id: dbInitiative.id };
    const [initiativeData, reputationData] = await Promise.all([caller.getInitiative(input), caller.getInitiativeReputation(input)]);

    prefetchedState = serializePrefetchedQueries([
      { path: 'getInitiative', input: input, data: initiativeData },
      { path: 'getInitiativeReputation', input: input, data: reputationData },
    ]);
  } catch (error) {
    console.error(error);
  }

  const organizations = await getPageInitiativeOrganizations(dbInitiative.id);

  // The most precise organization (the deepest one) gives the closest services
  const closestOrganization = organizations.reduce<(typeof organizations)[number] | null>(
    // Ties are broken on the identifier, so a sheet always shows the same ones (the bindings come in no defined order)
    (closest, organization) =>
      !closest ||
      organization.ancestors.length > closest.ancestors.length ||
      (organization.ancestors.length === closest.ancestors.length && organization.id < closest.id)
        ? organization
        : closest,
    null
  );
  const otherInitiatives = closestOrganization
    ? await prisma.initiative.findMany({
        where: {
          id: { not: dbInitiative.id },
          deletedAt: null,
          OrganizationsOnInitiatives: { some: { organizationId: closestOrganization.id } },
        },
        select: { id: true, name: true, websites: true, repositories: true },
        orderBy: [{ reputationRank: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }, { id: 'asc' }],
        take: maximumRelatedInitiatives, // A single row of cards, the smaller screens hide some
      })
    : [];

  const relatedInitiatives = otherInitiatives;

  // Structured data for search engines, now that the page content is rendered by the server it is given to everyone
  let initiativeJsonLd: WithContext<CreativeWork> | null = null;
  {
    const initiative = initiativePrismaToModel({
      ...dbInitiative,
      businessUseCases: dbInitiative.BusinessUseCasesOnInitiatives.map((bucOnI) => bucOnI.businessUseCase.name),
      tools: dbInitiative.ToolsOnInitiatives.map((toolOnI) => toolOnI.tool.name),
      organizations: organizations,
      reputationReferenceRank: null, // Not part of the structured data
    });

    initiativeJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      // TODO: the link registry cannot be used server-side so not specifying the id (https://github.com/zilch/type-route/issues/125)
      // '@id': linkRegistry.get('initiative', { initiativeId: initiative.id }, { absolute: true }), // Must be unique as IRI
      name: initiative.name,
      description: initiative.description,
      url: initiative.websites,
      about: [
        {
          '@type': 'SoftwareSourceCode',
          codeRepository: initiative.repositories,
          keywords: initiative.tools,
        },
      ],
      potentialAction: [
        ...initiative.businessUseCases.map((businessUseCase) => {
          return {
            '@type': 'Action' as 'Action',
            description: businessUseCase,
            disambiguatingDescription: `${t('model.initiative.businessUseCase', { count: 1 })} : ${businessUseCase}`,
          };
        }),
        ...initiative.functionalUseCases.map((functionalUseCase) => {
          const functionalUseCaseName = t(`model.initiative.functionalUseCase.enum.${functionalUseCase}`);

          return {
            '@type': 'Action' as 'Action',
            description: functionalUseCaseName,
            disambiguatingDescription: `${t('model.initiative.functionalUseCase.label', { count: 1 })} : ${functionalUseCaseName}`,
          };
        }),
      ],
      sourceOrganization: initiative.organizations.map((organization) => ({
        '@type': 'GovernmentOrganization' as 'GovernmentOrganization',
        name: organization.name,
        alternateName: organization.acronym || undefined,
        url: organization.directoryUrl || undefined,
        parentOrganization:
          organization.ancestors.length > 0
            ? { '@type': 'GovernmentOrganization', name: organization.ancestors[organization.ancestors.length - 1].name }
            : undefined,
      })),
      dateModified: initiative.computedAt.toISOString(),
    };
  }

  return (
    <>
      {!!initiativeJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(initiativeJsonLd) }} />}
      {prefetchedState ? (
        <HydrateClient state={prefetchedState as any}>
          <InitiativePage params={{ initiativeId: dbInitiative.id }} relatedInitiatives={relatedInitiatives} />
        </HydrateClient>
      ) : (
        <InitiativePage params={{ initiativeId: dbInitiative.id }} relatedInitiatives={relatedInitiatives} />
      )}
    </>
  );
}
