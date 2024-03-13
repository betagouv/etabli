import { Prisma } from '@prisma/client';

import { llmManagerInstance } from '@etabli/src/features/llm';
import { GetInitiativeSchema, ListInitiativesSchema } from '@etabli/src/models/actions/initiative';
import { initiativeNotFoundError } from '@etabli/src/models/entities/errors';
import { prisma } from '@etabli/src/prisma/client';
import { initiativePrismaToModel } from '@etabli/src/server/routers/mappers';
import { publicProcedure, router } from '@etabli/src/server/trpc';
import { paginate } from '@etabli/src/utils/page';

export const initiativeRouter = router({
  getInitiative: publicProcedure.input(GetInitiativeSchema).query(async ({ ctx, input }) => {
    const initiative = await prisma.initiative.findUnique({
      where: {
        id: input.id,
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

    if (!initiative) {
      throw initiativeNotFoundError;
    }

    return {
      initiative: initiativePrismaToModel({
        ...initiative,
        businessUseCases: initiative.BusinessUseCasesOnInitiatives.map((bucOnI) => bucOnI.businessUseCase.name),
        tools: initiative.ToolsOnInitiatives.map((toolOnI) => toolOnI.tool.name),
      }),
    };
  }),
  listInitiatives: publicProcedure.input(ListInitiativesSchema).query(async ({ ctx, input }) => {
    // TODO: for when implementing filters on associations
    const where: Prisma.InitiativeWhereInput = {};

    let homemadePaginationInitiativeIds: string[] | null = null;
    let homemadePaginationTotalCount: number | null = null;

    if (!!input.filterBy.query) {
      // Restrict the search, the pagination will work as expected
      const matchingInitiativesIds = await llmManagerInstance.getInitiativesFromQuery(input.filterBy.query);
      const currentPageInitiativesIds = paginate(matchingInitiativesIds, input.pageSize, input.page);

      homemadePaginationInitiativeIds = currentPageInitiativesIds;
      homemadePaginationTotalCount = matchingInitiativesIds.length;

      where.id = {
        in: homemadePaginationInitiativeIds,
      };
    }

    // We do a transaction to get along the total count
    // Refs:
    // - https://github.com/prisma/prisma/issues/7550
    // - https://github.com/prisma/prisma/discussions/3087
    //
    // ---
    // Prisma has a limitation to order by a given list (https://github.com/prisma/prisma/issues/11336#issuecomment-1986031261) and cannot only use a `whereRaw` to work around
    // The first possibility would be to switch to a full raw query, but it's more complicated for typings and `include`... so we decided to do it in multiple steps to preverse the Prisma usage
    // Note: in case of a full raw query we would just kept the original code and enable the logs debug mode to have 90% of the raw query written, and using a where with something like `ORDER BY array_position(ARRAY[1, 2, 3]::uuid[], table_name.id::uuid)`
    let [initiatives, totalCount] = await prisma.$transaction([
      prisma.initiative.findMany({
        where: where,
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
        ...(!!homemadePaginationInitiativeIds
          ? {
              // The pagination is done before this, and sorting will be done after
            }
          : {
              orderBy: {
                name: 'asc',
              },
              skip: (input.page - 1) * input.pageSize,
              take: input.pageSize,
            }),
      }),
      ...(homemadePaginationTotalCount !== null ? [] : [prisma.initiative.count({ where: where })]),
    ]);

    if (totalCount === undefined && homemadePaginationTotalCount !== null) {
      totalCount = homemadePaginationTotalCount;
    }

    if (!!homemadePaginationInitiativeIds) {
      // As explained above we need to sort them since Prisma does not handle this, in the order returned by the LLM instance since IDs are initially sorted by relevance score
      initiatives = initiatives.sort((a, b) => {
        return (homemadePaginationInitiativeIds as string[]).indexOf(a.id) - (homemadePaginationInitiativeIds as string[]).indexOf(b.id);
      });
    }

    return {
      initiatives: initiatives.map((initiative) =>
        initiativePrismaToModel({
          ...initiative,
          businessUseCases: initiative.BusinessUseCasesOnInitiatives.map((bucOnI) => bucOnI.businessUseCase.name),
          tools: initiative.ToolsOnInitiatives.map((toolOnI) => toolOnI.tool.name),
        })
      ),
      totalCount: totalCount,
    };
  }),
});
