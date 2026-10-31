-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('SENT', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "ApprovalMethod" ADD VALUE 'FLEET_PORTAL';

-- AlterEnum
ALTER TYPE "NotificationChannel" ADD VALUE 'EMAIL';

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "externalAttachmentId" TEXT;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "linkedOrganizationId" TEXT;

-- AlterTable
ALTER TABLE "Diagnosis" ADD COLUMN     "externalDiagnosisId" TEXT;

-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "externalEstimateId" TEXT;

-- AlterTable
ALTER TABLE "EstimateItem" ADD COLUMN     "externalItemId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "externalInvoiceId" TEXT;

-- AlterTable
ALTER TABLE "ServiceProvider" ADD COLUMN     "garageOrganizationId" TEXT;

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "fleetOrganizationId" TEXT NOT NULL,
    "fleetJobId" TEXT NOT NULL,
    "garageOrganizationId" TEXT NOT NULL,
    "garageJobId" TEXT,
    "serviceProviderId" TEXT NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'SENT',
    "message" TEXT,
    "declineReason" TEXT,
    "sentByUserId" TEXT NOT NULL,
    "respondedByUserId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_garageJobId_key" ON "WorkOrder"("garageJobId");

-- CreateIndex
CREATE INDEX "WorkOrder_fleetOrganizationId_status_idx" ON "WorkOrder"("fleetOrganizationId", "status");

-- CreateIndex
CREATE INDEX "WorkOrder_fleetJobId_idx" ON "WorkOrder"("fleetJobId");

-- CreateIndex
CREATE INDEX "WorkOrder_garageOrganizationId_status_idx" ON "WorkOrder"("garageOrganizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_externalAttachmentId_key" ON "Attachment"("externalAttachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Diagnosis_externalDiagnosisId_key" ON "Diagnosis"("externalDiagnosisId");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_externalEstimateId_key" ON "Estimate"("externalEstimateId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_externalInvoiceId_key" ON "Invoice"("externalInvoiceId");

-- CreateIndex
CREATE INDEX "ServiceProvider_garageOrganizationId_idx" ON "ServiceProvider"("garageOrganizationId");

