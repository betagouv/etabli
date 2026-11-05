-- AlterTable
ALTER TABLE "Initiative" ADD COLUMN "computedAt" TIMESTAMP(3);

-- `updatedAt` moved with unrelated changes of the rows, so the creation is the best known date for what already exists
UPDATE "Initiative" SET "computedAt" = "createdAt";
