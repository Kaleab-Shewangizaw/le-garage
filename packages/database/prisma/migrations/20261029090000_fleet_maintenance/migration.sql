-- CreateEnum
CREATE TYPE "OrganizationKind" AS ENUM ('GARAGE', 'FLEET');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE', 'IN_MAINTENANCE', 'UNAVAILABLE', 'RETIRED');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('CAR', 'PICKUP', 'VAN', 'TRUCK', 'MINIBUS', 'BUS', 'MOTORCYCLE', 'OTHER');

-- AlterEnum
ALTER TYPE "ApprovalMethod" ADD VALUE 'STAFF_DECISION';

-- DropIndex
DROP INDEX "Vehicle_vin_key";

-- AlterTable
ALTER TABLE "Approval" ADD COLUMN     "decidedByStaffId" TEXT;

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "type" "EstimateItemType";

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "serviceProviderId" TEXT,
ALTER COLUMN "customerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "kind" "OrganizationKind" NOT NULL DEFAULT 'GARAGE';

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "status" "VehicleStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "vehicleType" "VehicleType";

-- CreateTable
CREATE TABLE "ServiceProvider" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceProvider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceProvider_organizationId_idx" ON "ServiceProvider"("organizationId");

-- CreateIndex
CREATE INDEX "Job_organizationId_serviceProviderId_idx" ON "Job"("organizationId", "serviceProviderId");

-- CreateIndex
CREATE INDEX "Vehicle_organizationId_status_idx" ON "Vehicle"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_organizationId_vin_key" ON "Vehicle"("organizationId", "vin");

-- AddForeignKey
ALTER TABLE "ServiceProvider" ADD CONSTRAINT "ServiceProvider_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_serviceProviderId_fkey" FOREIGN KEY ("serviceProviderId") REFERENCES "ServiceProvider"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_decidedByStaffId_fkey" FOREIGN KEY ("decidedByStaffId") REFERENCES "StaffMember"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

