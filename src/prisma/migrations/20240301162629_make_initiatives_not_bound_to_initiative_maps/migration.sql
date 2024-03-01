-- DropForeignKey
ALTER TABLE "Initiative" DROP CONSTRAINT "Initiative_originId_fkey";

-- AlterTable
ALTER TABLE "Initiative" ALTER COLUMN "originId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_originId_fkey" FOREIGN KEY ("originId") REFERENCES "InitiativeMap"("id") ON DELETE SET NULL ON UPDATE CASCADE;
