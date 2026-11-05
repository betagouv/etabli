-- CreateTable
CREATE TABLE "DomainHttpSecurity" (
    "domain" TEXT NOT NULL,
    "update" BOOLEAN NOT NULL DEFAULT true,
    "grade" TEXT,
    "score" INTEGER,
    "testsPassed" INTEGER,
    "testsFailed" INTEGER,
    "testsQuantity" INTEGER,
    "statusCode" INTEGER,
    "algorithmVersion" INTEGER,
    "tests" JSONB,
    "scannedAt" TIMESTAMP(3),
    "lastCheckAt" TIMESTAMP(3),
    "lastCheckError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainHttpSecurity_pkey" PRIMARY KEY ("domain")
);

-- CreateIndex
CREATE INDEX "DomainHttpSecurity_update_idx" ON "DomainHttpSecurity"("update");
