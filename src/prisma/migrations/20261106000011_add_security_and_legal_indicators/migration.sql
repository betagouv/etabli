-- AlterTable
ALTER TABLE "RawDomain" ADD COLUMN "websiteHasLegalNotice" BOOLEAN,
ADD COLUMN "websiteHasPrivacyPolicy" BOOLEAN;

-- AlterTable
ALTER TABLE "Initiative" ADD COLUMN "httpSecurityGrade" TEXT,
ADD COLUMN "tlsGrade" TEXT,
ADD COLUMN "hasLegalNotice" BOOLEAN,
ADD COLUMN "hasPrivacyPolicy" BOOLEAN;

-- CreateTable
CREATE TABLE "DomainTlsSecurity" (
    "domain" TEXT NOT NULL,
    "update" BOOLEAN NOT NULL DEFAULT true,
    "grade" TEXT,
    "endpoints" JSONB,
    "lastCheckAt" TIMESTAMP(3),
    "lastCheckError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainTlsSecurity_pkey" PRIMARY KEY ("domain")
);

-- CreateIndex
CREATE INDEX "DomainTlsSecurity_update_idx" ON "DomainTlsSecurity"("update");
