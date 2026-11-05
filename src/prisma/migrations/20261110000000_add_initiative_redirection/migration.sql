-- CreateTable
CREATE TABLE "InitiativeRedirection" (
    "fromInitiativeId" UUID NOT NULL,
    "toInitiativeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InitiativeRedirection_pkey" PRIMARY KEY ("fromInitiativeId")
);

-- CreateIndex
CREATE INDEX "InitiativeRedirection_toInitiativeId_idx" ON "InitiativeRedirection"("toInitiativeId");

-- AddForeignKey
ALTER TABLE "InitiativeRedirection" ADD CONSTRAINT "InitiativeRedirection_toInitiativeId_fkey" FOREIGN KEY ("toInitiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
