-- AlterTable
ALTER TABLE "RawDomain" ADD COLUMN     "isProtected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "protection" TEXT,
ADD COLUMN     "updateProtectedWebsiteData" BOOLEAN NOT NULL DEFAULT false;
