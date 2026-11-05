-- AlterTable
ALTER TABLE "RawDomain"
ADD COLUMN "acceptsTls10" BOOLEAN,
ADD COLUMN "acceptsTls11" BOOLEAN,
ADD COLUMN "tlsIssues" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "tlsLevel" INTEGER;

-- AlterTable
ALTER TABLE "Initiative"
DROP COLUMN "tlsGrade",
ADD COLUMN "tlsIssues" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "tlsLevel" INTEGER,
ADD COLUMN "mailIssues" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "mailSecurityLevel" INTEGER;

-- DropTable
DROP TABLE "DomainTlsSecurity";

-- CreateTable
CREATE TABLE "DomainMailSecurity" (
    "domain" TEXT NOT NULL,
    "rootDomain" TEXT,
    "hasMx" BOOLEAN,
    "txtRecords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dmarcRecords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "usesMail" BOOLEAN,
    "issues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "level" INTEGER,
    "lastCheckAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainMailSecurity_pkey" PRIMARY KEY ("domain")
);
