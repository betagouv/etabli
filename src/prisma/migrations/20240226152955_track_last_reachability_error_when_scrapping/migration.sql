-- AlterTable
ALTER TABLE "InitiativeMap" ADD COLUMN     "lastUpdateAttemptWithReachabilityError" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RawDomain" ADD COLUMN     "lastUpdateAttemptWithReachabilityError" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RawRepository" ADD COLUMN     "lastUpdateAttemptWithReachabilityError" TIMESTAMP(3);
