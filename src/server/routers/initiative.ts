import { Prisma } from '@etabli/src/generated/prisma/client';
import { GetInitiativeSchema, ListInitiativesSchema } from '@etabli/src/models/actions/initiative';
import { initiativeNotFoundError } from '@etabli/src/models/entities/errors';
import { prisma } from '@etabli/src/prisma/client';
import { initiativePrismaToModel } from '@etabli/src/server/routers/mappers';
import { publicProcedure, router } from '@etabli/src/server/trpc';
import { paginate } from '@etabli/src/utils/page';

export const initiativeRouter = router({
  listTools: publicProcedure.query(async () => {
    const tools = await prisma.tool.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    return { tools };
  }),
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
    const extraFilters: Prisma.InitiativeWhereInput[] = [];
    if (input.filterBy.functionalUseCases && input.filterBy.functionalUseCases.length > 0) {
      extraFilters.push({ functionalUseCases: { hasSome: input.filterBy.functionalUseCases } });
    }
    if (input.filterBy.toolIds && input.filterBy.toolIds.length > 0) {
      extraFilters.push({ ToolsOnInitiatives: { some: { toolId: { in: input.filterBy.toolIds } } } });
    }
    if (input.filterBy.hasWebsite === true) {
      extraFilters.push({ NOT: { websites: { isEmpty: true } } });
    }
    if (input.filterBy.hasRepository === true) {
      extraFilters.push({ NOT: { repositories: { isEmpty: true } } });
    }

    const extraWhere: Prisma.InitiativeWhereInput = extraFilters.length > 0 ? { AND: extraFilters } : {};

    const includeRelations = {
      ToolsOnInitiatives: { include: { tool: { select: { name: true } } } },
      BusinessUseCasesOnInitiatives: { include: { businessUseCase: { select: { name: true } } } },
    } satisfies Prisma.InitiativeInclude;

    // Full-text search: when a query is provided we rank against a bilingual (FR/EN), accent-insensitive `tsvector`
    // (see the `searchableText` column and its migration). We build a PREFIX query (`word:*`) so a base word also
    // matches the morphological derivatives the stemmer keeps distinct — e.g. "police" stems to `polic` while
    // "policier" stems to `polici`, and the `polic:*` prefix matches both. Each word is stripped of punctuation
    // (`to_tsquery` rejects it, unlike `websearch_to_tsquery`) and the words are AND-ed together; the resulting
    // query is matched through both the French and English configurations so either language matches.
    //
    // On top of that we OR a `pg_trgm` trigram match on the name as a fuzzy fallback (typos, and the reverse
    // "policier" -> "police" direction the prefix cannot cover); those fuzzy-only matches are ranked strictly below
    // the exact full-text hits. The trigram threshold is raised above the 0.3 default because the default would
    // resurface noise (e.g. "police" is ~0.36 similar to "Poligné"); tune the value if precision/recall needs it.
    //
    // Note: true synonyms (e.g. "gendarme" <-> "police") would require a `dict_xsyn` synonym dictionary, but its
    // `.rules` file must live on the database server's filesystem, which Clever Cloud (managed PostgreSQL) does not
    // let us add, so synonyms are intentionally not handled here.
    if (input.filterBy.query) {
      const trimmedQuery = input.filterBy.query.trim();

      const words = trimmedQuery
        .split(/\s+/)
        .map((word) => word.replace(/[^\p{L}\p{N}]/gu, '')) // keep only letters/digits so `to_tsquery` does not choke
        .filter(Boolean);
      // Two queries from the same words: the EXACT stems (used only to boost ranking) and the PREFIX variant `word:*`
      // (used to actually match, so a base word still finds its derivatives). Because the prefix is greedy on a short
      // stem (e.g. `polic:*` matches "police" but also "policier" and the English "policy"), we rank documents that
      // contain the exact stem above those that only matched via the prefix — so "Police nationale" beats "password_policy".
      const tsExactQueryString = words.join(' & ');
      const tsPrefixQueryString = words.map((word) => `${word}:*`).join(' & ');

      // Strongest ranking signals are LITERAL (unstemmed) matches on the name, because stemming collapses different
      // words to the same lexeme (the French stemmer maps both "etabli" and "etablissement" to ~`etabl`, and mangles
      // the English "policies" toward `polic`/"police"), so stem-based ranking cannot separate them.
      //   1. whole-word match (`\m...\M`): "etabli" is a standalone word in the name "etabli" but NOT in
      //      "etablissement", and "police" is a word in "Police nationale" but absent from "multiagent_gnn_policies".
      //   2. substring match: weaker, e.g. "etabli" inside "etablissement".
      // The query is escaped for the regex since it is arbitrary user input.
      const escapedRegexQuery = trimmedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wholeWordNamePattern = `\\m${escapedRegexQuery}\\M`;
      const literalNamePattern = `%${trimmedQuery}%`;

      const rankedMatches = await prisma.$transaction(async (tx) => {
        // Restrict the trigram fallback to CLOSE matches, otherwise the fuzzy search brings back irrelevant results
        await tx.$executeRawUnsafe('SET LOCAL pg_trgm.similarity_threshold = 0.4');

        return tx.$queryRaw<{ id: string }[]>`
          SELECT i."id"
          FROM "Initiative" i,
            (
              SELECT
                to_tsquery('french_unaccent', ${tsPrefixQueryString}) ||
                to_tsquery('english_unaccent', ${tsPrefixQueryString}) AS prefix_query,
                to_tsquery('french_unaccent', ${tsExactQueryString}) ||
                to_tsquery('english_unaccent', ${tsExactQueryString}) AS exact_query
            ) q
          WHERE i."searchableText" @@ q.prefix_query
             OR i."name" % ${trimmedQuery}
          ORDER BY
            (i."name" ~* ${wholeWordNamePattern}) DESC, -- whole-word match in the name ("etabli", not "etablissement") ranks first
            (i."name" ILIKE ${literalNamePattern}) DESC, -- then a substring of the name ("etabli" inside "etablissement")
            (i."searchableText" @@ q.exact_query) DESC, -- then exact stem above prefix-only ("policy"/"policier") and fuzzy
            ts_rank(i."searchableText", q.prefix_query) DESC, -- then by relevance; fuzzy-only matches (rank 0) fall last
            similarity(i."name", ${trimmedQuery}) DESC,
            i."name" ASC
        `;
      });
      const rankedIds = rankedMatches.map((m) => m.id);

      // Apply the extra filters to the candidate set to get the final filtered, ranked ID list — needed for
      // an accurate total count before we paginate in memory.
      let filteredIds = rankedIds;
      if (rankedIds.length > 0 && extraFilters.length > 0) {
        const kept = await prisma.initiative.findMany({
          where: { AND: [{ id: { in: rankedIds } }, extraWhere] },
          select: { id: true },
        });
        const keptSet = new Set(kept.map((k) => k.id));
        filteredIds = rankedIds.filter((id) => keptSet.has(id));
      }

      const totalCount = filteredIds.length;
      const pageInitiativeIds = paginate(filteredIds, input.pageSize, input.page);

      const initiatives = await prisma.initiative.findMany({
        where: { id: { in: pageInitiativeIds } },
        include: includeRelations,
      });

      // Prisma cannot order by a given list, so we re-sort in memory to preserve the relevance ranking
      // See https://github.com/prisma/prisma/issues/11336#issuecomment-1986031261
      initiatives.sort((a, b) => pageInitiativeIds.indexOf(a.id) - pageInitiativeIds.indexOf(b.id));

      return {
        initiatives: initiatives.map((initiative) =>
          initiativePrismaToModel({
            ...initiative,
            businessUseCases: initiative.BusinessUseCasesOnInitiatives.map((bucOnI) => bucOnI.businessUseCase.name),
            tools: initiative.ToolsOnInitiatives.map((toolOnI) => toolOnI.tool.name),
          })
        ),
        totalCount,
      };
    }

    const [initiatives, totalCount] = await prisma.$transaction([
      prisma.initiative.findMany({
        where: extraWhere,
        include: includeRelations,
        orderBy: { name: 'asc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      prisma.initiative.count({ where: extraWhere }),
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
