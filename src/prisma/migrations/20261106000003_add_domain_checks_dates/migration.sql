-- AlterTable
ALTER TABLE "RawDomain" ADD COLUMN     "lastCertificateCheckAt" TIMESTAMP(3),
ADD COLUMN     "lastRobotsTxtCheckAt" TIMESTAMP(3),
ADD COLUMN     "lastWebsiteDataCheckAt" TIMESTAMP(3);

-- What has been processed so far is considered as checked recently, with dates spread over the delay between 2 checks
-- so all the domains do not come back during the same run
UPDATE "RawDomain"
SET
  "lastRobotsTxtCheckAt" = CASE WHEN NOT "updateIndexableFromRobotsTxt" THEN now() - random() * interval '20 days' END,
  "lastCertificateCheckAt" = CASE WHEN NOT "updateWildcardCertificate" THEN now() - random() * interval '20 days' END,
  "lastWebsiteDataCheckAt" = CASE WHEN NOT "updateWebsiteData" THEN now() - random() * interval '20 days' END;
