-- AlterEnum
ALTER TYPE "OrganizationKind" ADD VALUE 'PLATFORM';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedReason" TEXT;

