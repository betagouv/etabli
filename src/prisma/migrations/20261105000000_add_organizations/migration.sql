-- Organizations from the DILA directory, forge accounts from code.gouv.fr, and their binding to initiatives
-- Note: the diff also proposed to drop the manual full-text/trigram indexes on "Initiative" (see 20260611000000_add_initiative_fulltext_search), they are intentionally not part of this migration

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "dilaId" UUID NOT NULL,
    "parentOrganizationId" UUID,
    "ancestorIds" UUID[],
    "level" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "acronym" TEXT,
    "domains" TEXT[],
    "directoryUrl" TEXT,
    "localServiceType" TEXT,
    "initiativesCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositoryOrganization" (
    "id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "dilaId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepositoryOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationsOnInitiatives" (
    "organizationId" UUID NOT NULL,
    "initiativeId" UUID NOT NULL,

    CONSTRAINT "OrganizationsOnInitiatives_pkey" PRIMARY KEY ("organizationId","initiativeId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_dilaId_key" ON "Organization"("dilaId");

-- CreateIndex
CREATE INDEX "Organization_parentOrganizationId_idx" ON "Organization"("parentOrganizationId");

-- CreateIndex
CREATE INDEX "Organization_ancestorIds_idx" ON "Organization" USING GIN ("ancestorIds");

-- CreateIndex
CREATE INDEX "Organization_initiativesCount_idx" ON "Organization"("initiativesCount");

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryOrganization_url_key" ON "RepositoryOrganization"("url");

-- CreateIndex
CREATE INDEX "OrganizationsOnInitiatives_initiativeId_idx" ON "OrganizationsOnInitiatives"("initiativeId");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_parentOrganizationId_fkey" FOREIGN KEY ("parentOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationsOnInitiatives" ADD CONSTRAINT "OrganizationsOnInitiatives_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationsOnInitiatives" ADD CONSTRAINT "OrganizationsOnInitiatives_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

