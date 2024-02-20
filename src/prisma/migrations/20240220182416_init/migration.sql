CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "RawRepositoryPlatform" AS ENUM ('GITHUB', 'GITLAB');

-- CreateEnum
CREATE TYPE "RawDomainType" AS ENUM ('COMMUNE', 'PUBLIC_INTERCOMMUNAL_COOPERATION_ESTABLISHMENT', 'COLLECTIVITY', 'REGIONAL_COUNCIL', 'LIBRARY', 'MANAGEMENT_CENTER', 'EDUCATIONAL_INSTITUTION', 'DEPARTMENTAL_COUNCIL', 'UNIVERSITY', 'EMBASSY', 'ACADEMY', 'DEPARTMENTAL_AUTONOMY_HOUSE', 'HOSPITAL', 'GOVERNMENT', 'PREFECTURE', 'HEALTH');

-- CreateEnum
CREATE TYPE "ToolCategory" AS ENUM ('LANGUAGES_AND_FRAMEWORKS', 'BUILD_TEST_DEPLOY', 'LIBRARIES', 'DATA_STORES', 'COLLABORATION', 'BACK_OFFICE', 'ANALYTICS', 'APPLICATION_HOSTING', 'APPLICATION_UTILITIES', 'ASSETS_AND_MEDIA', 'SUPPORT_SALES_AND_MARKETING', 'DESIGN', 'MONITORING', 'PAYMENTS', 'COMMUNICATIONS', 'MOBILE');

-- CreateEnum
CREATE TYPE "FunctionalUseCase" AS ENUM ('HAS_VIRTUAL_EMAIL_INBOXES', 'SENDS_EMAILS', 'GENERATES_PDF');

-- CreateTable
CREATE TABLE "Settings" (
    "onlyTrueAsId" BOOLEAN NOT NULL DEFAULT true,
    "llmBotAssistantId" TEXT,
    "llmAnalyzerAssistantId" TEXT,
    "initiativesBotAssistantFileIds" TEXT[],
    "initiativesBotAssistantFilesUpdatedAt" TIMESTAMP(3),
    "updateIngestedInitiatives" BOOLEAN NOT NULL DEFAULT false,
    "toolsAnalyzerAssistantFileId" TEXT,
    "toolsAnalyzerAssistantFileUpdatedAt" TIMESTAMP(3),
    "updateIngestedTools" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("onlyTrueAsId")
);

-- CreateTable
CREATE TABLE "InitiativeLlmDocument" (
    "id" TEXT NOT NULL,
    "initiativeId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "vector" vector,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calculatedAt" TIMESTAMP(3),

    CONSTRAINT "InitiativeLlmDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolLlmDocument" (
    "id" TEXT NOT NULL,
    "toolId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "vector" vector,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calculatedAt" TIMESTAMP(3),

    CONSTRAINT "ToolLlmDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawRepository" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "platform" "RawRepositoryPlatform" NOT NULL,
    "repositoryUrl" TEXT NOT NULL,
    "description" TEXT,
    "defaultBranch" TEXT NOT NULL,
    "isFork" BOOLEAN,
    "isArchived" BOOLEAN NOT NULL,
    "creationDate" TIMESTAMP(3) NOT NULL,
    "lastUpdate" TIMESTAMP(3) NOT NULL,
    "lastModification" TIMESTAMP(3) NOT NULL,
    "homepage" TEXT,
    "starsCount" INTEGER NOT NULL,
    "forksCount" INTEGER NOT NULL,
    "license" TEXT,
    "openIssuesCount" INTEGER NOT NULL,
    "language" TEXT,
    "topics" TEXT,
    "softwareHeritageExists" BOOLEAN,
    "softwareHeritageUrl" TEXT,
    "repositoryDomain" TEXT NOT NULL,
    "probableWebsiteUrl" TEXT,
    "probableWebsiteDomain" TEXT,
    "updateInferredMetadata" BOOLEAN NOT NULL DEFAULT true,
    "mainSimilarRepositoryId" UUID,
    "updateMainSimilarRepository" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RawRepository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawDomain" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "siren" TEXT NOT NULL,
    "type" "RawDomainType",
    "sources" TEXT NOT NULL,
    "redirectDomainTargetName" TEXT,
    "redirectDomainTargetId" UUID,
    "indexableFromRobotsTxt" BOOLEAN,
    "updateIndexableFromRobotsTxt" BOOLEAN NOT NULL DEFAULT true,
    "robotsTxtContent" TEXT,
    "wildcardCertificate" BOOLEAN,
    "updateWildcardCertificate" BOOLEAN NOT NULL DEFAULT true,
    "certificateContent" TEXT,
    "websiteRawContent" TEXT,
    "websiteTitle" TEXT,
    "websiteAnotherPageTitle" TEXT,
    "websiteInferredName" TEXT,
    "websiteHasContent" BOOLEAN,
    "websiteHasStyle" BOOLEAN,
    "websiteContentIndexable" BOOLEAN,
    "websitePseudoFingerprint" TEXT,
    "probableRepositoryUrl" TEXT,
    "probableRepositoryDomain" TEXT,
    "updateWebsiteData" BOOLEAN NOT NULL DEFAULT true,
    "mainSimilarDomainId" UUID,
    "updateMainSimilarDomain" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RawDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tool" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "category" "ToolCategory" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Tool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessUseCase" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BusinessUseCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolsOnInitiatives" (
    "toolId" UUID NOT NULL,
    "initiativeId" UUID NOT NULL,

    CONSTRAINT "ToolsOnInitiatives_pkey" PRIMARY KEY ("toolId","initiativeId")
);

-- CreateTable
CREATE TABLE "BusinessUseCasesOnInitiatives" (
    "businessUseCaseId" UUID NOT NULL,
    "initiativeId" UUID NOT NULL,

    CONSTRAINT "BusinessUseCasesOnInitiatives_pkey" PRIMARY KEY ("businessUseCaseId","initiativeId")
);

-- CreateTable
CREATE TABLE "RawDomainsOnInitiativeMaps" (
    "rawDomainId" UUID NOT NULL,
    "initiativeMapId" UUID NOT NULL,
    "main" BOOLEAN NOT NULL,

    CONSTRAINT "RawDomainsOnInitiativeMaps_pkey" PRIMARY KEY ("rawDomainId","initiativeMapId")
);

-- CreateTable
CREATE TABLE "RawRepositoriesOnInitiativeMaps" (
    "rawRepositoryId" UUID NOT NULL,
    "initiativeMapId" UUID NOT NULL,
    "main" BOOLEAN NOT NULL,

    CONSTRAINT "RawRepositoriesOnInitiativeMaps_pkey" PRIMARY KEY ("rawRepositoryId","initiativeMapId")
);

-- CreateTable
CREATE TABLE "InitiativeMap" (
    "id" UUID NOT NULL,
    "mainItemIdentifier" UUID NOT NULL,
    "update" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "InitiativeMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Initiative" (
    "id" UUID NOT NULL,
    "originId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "websites" TEXT[],
    "repositories" TEXT[],
    "functionalUseCases" "FunctionalUseCase"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Initiative_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InitiativeLlmDocument_initiativeId_key" ON "InitiativeLlmDocument"("initiativeId");

-- CreateIndex
CREATE UNIQUE INDEX "ToolLlmDocument_toolId_key" ON "ToolLlmDocument"("toolId");

-- CreateIndex
CREATE UNIQUE INDEX "RawRepository_platform_organizationName_name_key" ON "RawRepository"("platform", "organizationName", "name");

-- CreateIndex
CREATE UNIQUE INDEX "RawDomain_name_key" ON "RawDomain"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RawDomain_redirectDomainTargetId_key" ON "RawDomain"("redirectDomainTargetId");

-- CreateIndex
CREATE UNIQUE INDEX "Tool_name_key" ON "Tool"("name");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessUseCase_name_key" ON "BusinessUseCase"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RawDomainsOnInitiativeMaps_rawDomainId_key" ON "RawDomainsOnInitiativeMaps"("rawDomainId");

-- CreateIndex
CREATE UNIQUE INDEX "RawRepositoriesOnInitiativeMaps_rawRepositoryId_key" ON "RawRepositoriesOnInitiativeMaps"("rawRepositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Initiative_originId_key" ON "Initiative"("originId");

-- AddForeignKey
ALTER TABLE "InitiativeLlmDocument" ADD CONSTRAINT "InitiativeLlmDocument_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolLlmDocument" ADD CONSTRAINT "ToolLlmDocument_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawRepository" ADD CONSTRAINT "RawRepository_mainSimilarRepositoryId_fkey" FOREIGN KEY ("mainSimilarRepositoryId") REFERENCES "RawRepository"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawDomain" ADD CONSTRAINT "RawDomain_redirectDomainTargetId_fkey" FOREIGN KEY ("redirectDomainTargetId") REFERENCES "RawDomain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawDomain" ADD CONSTRAINT "RawDomain_mainSimilarDomainId_fkey" FOREIGN KEY ("mainSimilarDomainId") REFERENCES "RawDomain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolsOnInitiatives" ADD CONSTRAINT "ToolsOnInitiatives_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolsOnInitiatives" ADD CONSTRAINT "ToolsOnInitiatives_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessUseCasesOnInitiatives" ADD CONSTRAINT "BusinessUseCasesOnInitiatives_businessUseCaseId_fkey" FOREIGN KEY ("businessUseCaseId") REFERENCES "BusinessUseCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessUseCasesOnInitiatives" ADD CONSTRAINT "BusinessUseCasesOnInitiatives_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawDomainsOnInitiativeMaps" ADD CONSTRAINT "RawDomainsOnInitiativeMaps_rawDomainId_fkey" FOREIGN KEY ("rawDomainId") REFERENCES "RawDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawDomainsOnInitiativeMaps" ADD CONSTRAINT "RawDomainsOnInitiativeMaps_initiativeMapId_fkey" FOREIGN KEY ("initiativeMapId") REFERENCES "InitiativeMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawRepositoriesOnInitiativeMaps" ADD CONSTRAINT "RawRepositoriesOnInitiativeMaps_rawRepositoryId_fkey" FOREIGN KEY ("rawRepositoryId") REFERENCES "RawRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawRepositoriesOnInitiativeMaps" ADD CONSTRAINT "RawRepositoriesOnInitiativeMaps_initiativeMapId_fkey" FOREIGN KEY ("initiativeMapId") REFERENCES "InitiativeMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_originId_fkey" FOREIGN KEY ("originId") REFERENCES "InitiativeMap"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
