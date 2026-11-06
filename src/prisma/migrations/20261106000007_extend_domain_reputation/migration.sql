-- AlterTable
ALTER TABLE "DomainReputation"
ADD COLUMN "referringPages" INTEGER,
ADD COLUMN "referringDomainsNofollow" INTEGER,
ADD COLUMN "referringIps" INTEGER,
ADD COLUMN "brokenBacklinks" INTEGER,
ADD COLUMN "brokenPages" INTEGER,
ADD COLUMN "linksSemanticLocations" JSONB,
ADD COLUMN "linksTypes" JSONB,
ADD COLUMN "linksPlatformTypes" JSONB,
ADD COLUMN "linksCountries" JSONB,
ADD COLUMN "linksTopLevelDomains" JSONB;

-- Already paid values are moved from the raw statistics, `NULLIF` is about JSON null values
UPDATE "DomainReputation"
SET
  "referringPages" = ("summary"->>'referring_pages')::INTEGER,
  "referringDomainsNofollow" = ("summary"->>'referring_domains_nofollow')::INTEGER,
  "referringIps" = ("summary"->>'referring_ips')::INTEGER,
  "brokenBacklinks" = ("summary"->>'broken_backlinks')::INTEGER,
  "brokenPages" = ("summary"->>'broken_pages')::INTEGER,
  "linksSemanticLocations" = NULLIF("summary"->'referring_links_semantic_locations', 'null'::JSONB),
  "linksTypes" = NULLIF("summary"->'referring_links_types', 'null'::JSONB),
  "linksPlatformTypes" = NULLIF("summary"->'referring_links_platform_types', 'null'::JSONB),
  "linksCountries" = NULLIF("summary"->'referring_links_countries', 'null'::JSONB),
  "linksTopLevelDomains" = NULLIF("summary"->'referring_links_tld', 'null'::JSONB)
WHERE "summary" IS NOT NULL;
