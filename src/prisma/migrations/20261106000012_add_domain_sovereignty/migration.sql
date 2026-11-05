-- AlterTable
ALTER TABLE "Initiative" ADD COLUMN "foreignDependencyLevel" INTEGER;

-- CreateTable
CREATE TABLE "DomainSovereignty" (
    "domain" TEXT NOT NULL,
    "ipAddress" TEXT,
    "asn" INTEGER,
    "asnName" TEXT,
    "asnCountry" TEXT,
    "cnames" TEXT[],
    "mailHosts" TEXT[],
    "thirdPartyHosts" TEXT[],
    "level" INTEGER,
    "dependencies" TEXT[],
    "lastCheckAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainSovereignty_pkey" PRIMARY KEY ("domain")
);
