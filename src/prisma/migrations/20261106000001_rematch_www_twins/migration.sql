-- A subdomain could target its own `www.` twin as a clone, whereas `matchDomains()` now considers the domain without `www.` as the main one.
-- Those domains have to be processed again so both no longer target each other
UPDATE "RawDomain" d
SET "updateMainSimilarDomain" = true
FROM "RawDomain" twin
WHERE d."mainSimilarDomainId" = twin."id"
  AND twin."name" = 'www.' || d."name"
  AND d."redirectDomainTargetName" IS NULL;
