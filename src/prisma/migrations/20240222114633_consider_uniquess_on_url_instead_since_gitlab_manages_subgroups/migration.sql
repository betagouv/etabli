/*
  Warnings:

  - A unique constraint covering the columns `[repositoryUrl]` on the table `RawRepository` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "RawRepository_platform_organizationName_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "RawRepository_repositoryUrl_key" ON "RawRepository"("repositoryUrl");
