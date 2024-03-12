import { Prisma } from '@prisma/client';

import { llmManagerInstance } from '@etabli/src/features/llm';
import { GetInitiativeSchema, ListInitiativesSchema } from '@etabli/src/models/actions/initiative';
import { initiativeNotFoundError } from '@etabli/src/models/entities/errors';
import { prisma } from '@etabli/src/prisma/client';
import { initiativePrismaToModel } from '@etabli/src/server/routers/mappers';
import { publicProcedure, router } from '@etabli/src/server/trpc';

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
    const where: Prisma.InitiativeWhereInput = {};

    if (!!input.filterBy.query) {
      // Restrict the search, the pagination will work as expected
      const initiativesIds = await llmManagerInstance.getInitiativesFromQuery(input.filterBy.query);

      where.id = {
        in: initiativesIds,
      };
    }

    // We do a transaction to get along the total count
    // Refs:
    // - https://github.com/prisma/prisma/issues/7550
    // - https://github.com/prisma/prisma/discussions/3087
    const [initiatives, totalCount] = await prisma.$transaction([
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
        orderBy: {
          name: 'asc',
        },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      prisma.initiative.count({ where: where }),
    ]);

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
