-- Full-text search for initiatives (replaces the previous `ILIKE` + embeddings hybrid for the directory listing).
--
-- Goals:
--   * keyword search that actually stems words (so "police" matches "policier", "tool" matches "tools")
--   * accent-insensitive ("santé" matches "sante")
--   * bilingual: initiative content can be in French or English, so we index through BOTH dictionaries
--   * relevance ranking + a GIN index for speed
--
-- `unaccent` is a trusted contrib extension (installable without superuser since PostgreSQL 13).
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Custom text-search configurations that fold `unaccent` into the standard stemmers. Going through a named
-- configuration keeps `to_tsvector('<config>', ...)` IMMUTABLE, which is required to use it in a generated column
-- and an index expression (calling `unaccent()` directly would only be STABLE and would be rejected).
--
-- `CREATE TEXT SEARCH CONFIGURATION` has no `IF NOT EXISTS` form, so we guard it ourselves to keep the whole
-- migration idempotent (safe to re-run after a partial/manual apply).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'french_unaccent') THEN
    CREATE TEXT SEARCH CONFIGURATION french_unaccent (COPY = french);
    ALTER TEXT SEARCH CONFIGURATION french_unaccent
      ALTER MAPPING FOR hword, hword_part, word WITH unaccent, french_stem;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'english_unaccent') THEN
    CREATE TEXT SEARCH CONFIGURATION english_unaccent (COPY = english);
    ALTER TEXT SEARCH CONFIGURATION english_unaccent
      ALTER MAPPING FOR hword, hword_part, word WITH unaccent, english_stem;
  END IF;
END
$$;

-- Generated, always-up-to-date bilingual search vector. The name is weighted above the description ('A' > 'B')
-- so an initiative whose name matches ranks higher than one matched only in its description.
ALTER TABLE "Initiative"
  ADD COLUMN IF NOT EXISTS "searchableText" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('french_unaccent', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('english_unaccent', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('french_unaccent', coalesce("description", '')), 'B') ||
    setweight(to_tsvector('english_unaccent', coalesce("description", '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS "Initiative_searchableText_idx" ON "Initiative" USING GIN ("searchableText");

-- `pg_trgm` (available by default on Clever Cloud) powers a fuzzy fallback on the name: it catches typos and the
-- reverse "policier" -> "police" direction that prefix matching cannot. The GIN trigram index makes the `%`
-- operator index-accelerated. The similarity threshold is raised per-query in the router (the 0.3 default is too
-- low and would resurface noise, e.g. "police" is ~0.36 similar to "Poligné").
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Initiative_name_trgm_idx" ON "Initiative" USING GIN ("name" gin_trgm_ops);
