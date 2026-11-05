-- CreateTable
CREATE TABLE "DomainReputation" (
    "domain" TEXT NOT NULL,
    "update" BOOLEAN NOT NULL DEFAULT true,
    "rank" INTEGER,
    "backlinks" INTEGER,
    "referringDomains" INTEGER,
    "referringMainDomains" INTEGER,
    "backlinksSpamScore" INTEGER,
    "firstSeenAt" TIMESTAMP(3),
    "summary" JSONB,
    "lastCheckAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainReputation_pkey" PRIMARY KEY ("domain")
);

-- CreateIndex
CREATE INDEX "DomainReputation_update_idx" ON "DomainReputation"("update");

-- AlterTable
ALTER TABLE "Initiative" ADD COLUMN "reputationRank" INTEGER;

-- CreateIndex
CREATE INDEX "Initiative_reputationRank_idx" ON "Initiative"("reputationRank");
