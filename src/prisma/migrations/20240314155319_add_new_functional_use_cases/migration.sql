-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FunctionalUseCase" ADD VALUE 'SENDS_PUSH_NOTIFICATIONS';
ALTER TYPE "FunctionalUseCase" ADD VALUE 'GENERATES_SPREADSHEET_FILE';
ALTER TYPE "FunctionalUseCase" ADD VALUE 'HAS_SEARCH_SYSTEM';
ALTER TYPE "FunctionalUseCase" ADD VALUE 'HAS_AUTHENTICATION_SYSTEM';
ALTER TYPE "FunctionalUseCase" ADD VALUE 'PROVIDES_TWO_FACTOR_AUTHENTICATION';
ALTER TYPE "FunctionalUseCase" ADD VALUE 'MANAGES_FILE_UPLOAD';
ALTER TYPE "FunctionalUseCase" ADD VALUE 'HAS_PAYMENT_SYSTEM';
ALTER TYPE "FunctionalUseCase" ADD VALUE 'HAS_SEVERAL_LANGUAGES_AVAILABLE';
ALTER TYPE "FunctionalUseCase" ADD VALUE 'REPORTS_ANALYTICS';
ALTER TYPE "FunctionalUseCase" ADD VALUE 'REPORTS_ERRORS';
ALTER TYPE "FunctionalUseCase" ADD VALUE 'DISPLAYS_CARTOGRAPHY_MAP';
ALTER TYPE "FunctionalUseCase" ADD VALUE 'USES_ARTIFICIAL_INTELLIGENCE';
ALTER TYPE "FunctionalUseCase" ADD VALUE 'EXPOSES_API_ENDPOINTS';
