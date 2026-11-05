-- CreateTable
CREATE TABLE "DomainInventory" (
    "domain" TEXT NOT NULL,
    "lastCheckAt" TIMESTAMP(3),
    "lastCheckError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainInventory_pkey" PRIMARY KEY ("domain")
);

-- CreateTable
CREATE TABLE "DomainTechnology" (
    "domain" TEXT NOT NULL,
    "technology" TEXT NOT NULL,
    "version" TEXT,
    "cpe" TEXT,
    "confidence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainTechnology_pkey" PRIMARY KEY ("domain","technology")
);

-- CreateIndex
CREATE INDEX "DomainTechnology_technology_idx" ON "DomainTechnology"("technology");

-- AddForeignKey
ALTER TABLE "DomainTechnology" ADD CONSTRAINT "DomainTechnology_domain_fkey" FOREIGN KEY ("domain") REFERENCES "DomainInventory"("domain") ON DELETE CASCADE ON UPDATE CASCADE;
