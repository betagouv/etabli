-- AlterTable
ALTER TABLE "Initiative" ADD COLUMN "repositoryStars" INTEGER;

-- AlterTable
ALTER TABLE "RawDomain"
ADD COLUMN "certificateAuthorizationError" TEXT,
ADD COLUMN "certificateExpiresAt" TIMESTAMP(3),
ADD COLUMN "tlsProtocol" TEXT;
