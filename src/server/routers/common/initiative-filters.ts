import { Prisma } from '@etabli/src/generated/prisma/client';
import { ListInitiativesSchemaType } from '@etabli/src/models/actions/initiative';
import { prisma } from '@etabli/src/prisma/client';
import { issueLevelToNumber } from '@etabli/src/utils/domain-security-issues';
import { expandGradeLetters } from '@etabli/src/utils/security-grade';

type InitiativeFilterBy = ListInitiativesSchemaType['filterBy'];

// This logic is shared so the list, the organizations map and the tools breakdown cannot disagree on what matches

export function buildInitiativeFilters(filterBy: InitiativeFilterBy): Prisma.InitiativeWhereInput[] {
  const extraFilters: Prisma.InitiativeWhereInput[] = [];
  if (filterBy.functionalUseCases && filterBy.functionalUseCases.length > 0) {
    extraFilters.push({ functionalUseCases: { hasSome: filterBy.functionalUseCases } });
  }
  if (filterBy.toolIds && filterBy.toolIds.length > 0) {
    extraFilters.push({ ToolsOnInitiatives: { some: { toolId: { in: filterBy.toolIds } } } });
  }
  if (filterBy.hasWebsite === true) {
    extraFilters.push({ NOT: { websites: { isEmpty: true } } });
  }
  if (filterBy.hasRepository === true) {
    extraFilters.push({ NOT: { repositories: { isEmpty: true } } });
  }
  if (filterBy.httpSecurityGrades && filterBy.httpSecurityGrades.length > 0) {
    extraFilters.push({ httpSecurityGrade: { in: expandGradeLetters(filterBy.httpSecurityGrades) } });
  }
  if (filterBy.tlsLevels && filterBy.tlsLevels.length > 0) {
    extraFilters.push({ tlsLevel: { in: filterBy.tlsLevels.map(issueLevelToNumber) } });
  }
  if (filterBy.mailSecurityLevels && filterBy.mailSecurityLevels.length > 0) {
    extraFilters.push({ mailSecurityLevel: { in: filterBy.mailSecurityLevels.map(issueLevelToNumber) } });
  }
  if (filterBy.foreignDependencyLevels && filterBy.foreignDependencyLevels.length > 0) {
    extraFilters.push({ foreignDependencyLevel: { in: filterBy.foreignDependencyLevels } });
  }
  if (filterBy.legalNotice) {
    extraFilters.push({ hasLegalNotice: filterBy.legalNotice === 'with' });
  }
  if (filterBy.privacyPolicy) {
    extraFilters.push({ hasPrivacyPolicy: filterBy.privacyPolicy === 'with' });
  }
  const organizationFilters: Prisma.InitiativeWhereInput[] = [];
  if (filterBy.organizationIds && filterBy.organizationIds.length > 0) {
    // Selecting an organization also brings initiatives of its descendants (e.g. a ministry and all its directions)
    organizationFilters.push({
      OrganizationsOnInitiatives: {
        some: {
          organization: {
            OR: [{ id: { in: filterBy.organizationIds } }, { ancestorIds: { hasSome: filterBy.organizationIds } }],
          },
        },
      },
    });
  }
  if (filterBy.unclassified === true) {
    organizationFilters.push({ OrganizationsOnInitiatives: { none: {} } });
  }
  if (organizationFilters.length > 0) {
    // Organizations criteria are alternatives (like a multiple choice), whereas other filters are cumulative
    extraFilters.push(organizationFilters.length === 1 ? organizationFilters[0] : { OR: organizationFilters });
  }

  return extraFilters;
}

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
export async function searchRankedInitiativesIds(query: string): Promise<string[]> {
  const trimmedQuery = query.trim();

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
      WHERE i."deletedAt" IS NULL -- Removed sheets are no longer part of the directory
        AND (
          i."searchableText" @@ q.prefix_query
          OR i."name" % ${trimmedQuery}
        )
      ORDER BY
        (i."name" ~* ${wholeWordNamePattern}) DESC, -- whole-word match in the name ("etabli", not "etablissement") ranks first
        (i."name" ILIKE ${literalNamePattern}) DESC, -- then a substring of the name ("etabli" inside "etablissement")
        CASE WHEN i."name" ILIKE ${literalNamePattern} THEN i."reputationRank" END DESC NULLS LAST, -- among names matching, the most known first
        (i."searchableText" @@ q.exact_query) DESC, -- then exact stem above prefix-only ("policy"/"policier") and fuzzy
        ts_rank(i."searchableText", q.prefix_query) DESC, -- then by relevance; fuzzy-only matches (rank 0) fall last
        similarity(i."name", ${trimmedQuery}) DESC,
        i."name" ASC
    `;
  });

  return rankedMatches.map((m) => m.id);
}

// Identifiers of initiatives matching the filters, or `null` when there is no criterion (all initiatives)
export async function retrieveFilteredInitiativesIds(filterBy: InitiativeFilterBy): Promise<string[] | null> {
  const filters = buildInitiativeFilters(filterBy);

  if (filterBy.query) {
    const rankedIds = await searchRankedInitiativesIds(filterBy.query);

    if (rankedIds.length === 0 || filters.length === 0) {
      return rankedIds;
    }

    const kept = await prisma.initiative.findMany({
      where: { AND: [{ id: { in: rankedIds } }, ...filters] },
      select: { id: true },
    });

    return kept.map((initiative) => initiative.id);
  }

  if (filters.length === 0) {
    return null;
  }

  const initiatives = await prisma.initiative.findMany({
    where: { AND: filters },
    select: { id: true },
  });

  return initiatives.map((initiative) => initiative.id);
}
