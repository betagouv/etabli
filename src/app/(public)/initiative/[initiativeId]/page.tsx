import { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { userAgent } from 'next/server';
import { CreativeWork, WithContext } from 'schema-dts';

import { InitiativePage, InitiativePageProps } from '@etabli/src/app/(public)/initiative/[initiativeId]/InitiativePage';
import { useServerTranslation } from '@etabli/src/i18n';
import { GetInitiativeSchema } from '@etabli/src/models/actions/initiative';
import { prisma } from '@etabli/src/prisma';
import { initiativePrismaToModel } from '@etabli/src/server/routers/mappers';
import { formatPageTitle } from '@etabli/src/utils/page';

export async function generateMetadata(props: InitiativePageProps): Promise<Metadata> {
  let initiativeName: string | null = null;

  try {
    const initiativeId = GetInitiativeSchema.shape.id.parse(props.params.initiativeId);

    const initiative = await prisma.initiative.findUniqueOrThrow({
      where: {
        id: initiativeId,
      },
    });

    initiativeName = initiative.name;
  } catch (error) {
    // Probably the ID passed is not a valid UUID or existing, we silent the error since it does not change the logic
  }

  return {
    title: formatPageTitle(!!initiativeName ? `${initiativeName} - Initiative` : `Initiative`),
  };
}

export default async function Page(props: InitiativePageProps) {
  const { t } = useServerTranslation('common');

  const userAgentObject = userAgent({ headers: headers() });

  // Since this page has a dynamic pathname and the data is fetched from the frontend we add a condition so search engines
  // still have content to index in case they don't do client rendering with `puppeteer` or equivalent
  let initiativeJsonLd: WithContext<CreativeWork> | null = null;
  if (userAgentObject.isBot) {
    const result = GetInitiativeSchema.shape.id.safeParse(props.params.initiativeId);
    if (!result.success) {
      return notFound();
    }

    // We rely on the UUID validation from `generateMetadata()`
    const dbInitiative = await prisma.initiative.findUnique({
      where: {
        id: result.data,
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

    if (!dbInitiative) {
      return notFound();
    }

    const initiative = initiativePrismaToModel({
      ...dbInitiative,
      businessUseCases: dbInitiative.BusinessUseCasesOnInitiatives.map((bucOnI) => bucOnI.businessUseCase.name),
      tools: dbInitiative.ToolsOnInitiatives.map((toolOnI) => toolOnI.tool.name),
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
      dateModified: initiative.updatedAt.toISOString(),
    };
  }

  return (
    <>
      {!!initiativeJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(initiativeJsonLd) }} />}
      <InitiativePage {...props} />
    </>
  );
}
