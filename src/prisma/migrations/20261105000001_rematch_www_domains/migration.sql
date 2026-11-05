-- `www.example.com` and `example.com` were not always gathered: the fingerprint comparison ignored the domain without subdomain
-- and depended on which one was created first. Since `matchDomains()` now handles this case, those domains have to be processed again
-- (it will merge their initiative maps at the next update, gathering duplicated initiatives)
UPDATE "RawDomain" d
SET "updateMainSimilarDomain" = true
WHERE d."name" LIKE 'www.%'
  AND d."mainSimilarDomainId" IS NULL
  AND d."redirectDomainTargetName" IS NULL
  AND EXISTS (SELECT 1 FROM "RawDomain" twin WHERE twin."name" = substring(d."name" FROM 5));
