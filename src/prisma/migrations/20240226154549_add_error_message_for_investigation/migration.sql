-- AlterTable
ALTER TABLE "InitiativeMap" ADD COLUMN     "lastUpdateAttemptReachabilityError" TEXT;

-- AlterTable
ALTER TABLE "RawDomain" ADD COLUMN     "lastUpdateAttemptReachabilityError" TEXT;

-- AlterTable
ALTER TABLE "RawRepository" ADD COLUMN     "lastUpdateAttemptReachabilityError" TEXT;
