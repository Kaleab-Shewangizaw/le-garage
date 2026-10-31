-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "caption" TEXT,
ADD COLUMN     "tag" "AttachmentTag";

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "acquiredAt" TIMESTAMP(3),
ADD COLUMN     "driverName" TEXT,
ADD COLUMN     "driverPhone" TEXT,
ADD COLUMN     "fuelType" "FuelType",
ADD COLUMN     "notes" TEXT;

-- CreateIndex
CREATE INDEX "Attachment_vehicleId_idx" ON "Attachment"("vehicleId");

