-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'MANAGER', 'FRONT_DESK', 'TECHNICIAN', 'PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('ETB');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('INTAKE', 'DIAGNOSING', 'WAITING_APPROVAL', 'APPROVED', 'WAITING_PARTS', 'IN_PROGRESS', 'QUALITY_CHECK', 'READY', 'COLLECTED', 'ON_HOLD', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('DRAFT', 'SENT', 'SUPERSEDED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EstimateItemType" AS ENUM ('PART', 'LABOR');

-- CreateEnum
CREATE TYPE "ApprovalMethod" AS ENUM ('IN_APP', 'VERBAL_LOGGED_BY_STAFF', 'PHONE');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PartCondition" AS ENUM ('NEW', 'USED', 'REFURBISHED');

-- CreateEnum
CREATE TYPE "PartSource" AS ENUM ('GARAGE_SUPPLIED', 'CUSTOMER_SUPPLIED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TELEBIRR', 'BANK_TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "AttachmentEntityType" AS ENUM ('JOB', 'DIAGNOSIS', 'ESTIMATE', 'VEHICLE');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'SMS', 'TELEGRAM', 'WHATSAPP', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Garage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT NOT NULL DEFAULT 'Addis Ababa',
    "businessHours" JSONB,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Garage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "garageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vin" TEXT,
    "licensePlate" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER,
    "color" TEXT,
    "lastKnownMileage" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleOwnerHistory" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "VehicleOwnerHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "garageId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "assignedTechnicianId" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'INTAKE',
    "complaint" TEXT NOT NULL,
    "mileageAtIntake" INTEGER,
    "intakeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diagnosingAt" TIMESTAMP(3),
    "waitingApprovalAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "inProgressAt" TIMESTAMP(3),
    "qualityCheckAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobStatusEvent" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "fromStatus" "JobStatus",
    "toStatus" "JobStatus" NOT NULL,
    "actorUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Diagnosis" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "authorStaffId" TEXT NOT NULL,
    "observedProblem" TEXT NOT NULL,
    "suspectedCause" TEXT,
    "confirmedCause" TEXT,
    "severity" TEXT,
    "recommendedRepair" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Diagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "EstimateStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" "Currency" NOT NULL DEFAULT 'ETB',
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "taxTotal" INTEGER NOT NULL DEFAULT 0,
    "discountTotal" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "createdByStaffId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "supersedesEstimateId" TEXT,

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateItem" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "type" "EstimateItemType" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "lineTotal" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstimateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "method" "ApprovalMethod" NOT NULL,
    "decidedByCustomerId" TEXT,
    "loggedByStaffId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalItemDecision" (
    "id" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "estimateItemId" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,

    CONSTRAINT "ApprovalItemDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPart" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "partNumber" TEXT,
    "brand" TEXT,
    "condition" "PartCondition" NOT NULL DEFAULT 'NEW',
    "source" "PartSource" NOT NULL DEFAULT 'GARAGE_SUPPLIED',
    "supplier" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitCost" INTEGER,
    "unitPrice" INTEGER NOT NULL,
    "warrantyMonths" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLabor" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "technicianStaffId" TEXT,
    "hours" DOUBLE PRECISION,
    "rate" INTEGER,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobLabor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" "Currency" NOT NULL DEFAULT 'ETB',
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "taxTotal" INTEGER NOT NULL DEFAULT 0,
    "discountTotal" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "supersedesInvoiceId" TEXT,
    "issuedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdByStaffId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "lineTotal" INTEGER NOT NULL,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "recordedByStaffId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" "AttachmentEntityType" NOT NULL,
    "jobId" TEXT,
    "diagnosisId" TEXT,
    "estimateId" TEXT,
    "vehicleId" TEXT,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedByStaffId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRecord" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "garageId" TEXT NOT NULL,
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "mileage" INTEGER,
    "summary" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT,
    "beforeState" JSONB,
    "afterState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_phone_idx" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "Garage_organizationId_key" ON "Garage"("organizationId");

-- CreateIndex
CREATE INDEX "StaffMember_organizationId_idx" ON "StaffMember"("organizationId");

-- CreateIndex
CREATE INDEX "StaffMember_userId_idx" ON "StaffMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffMember_garageId_userId_key" ON "StaffMember"("garageId", "userId");

-- CreateIndex
CREATE INDEX "Customer_organizationId_phone_idx" ON "Customer"("organizationId", "phone");

-- CreateIndex
CREATE INDEX "Customer_organizationId_fullName_idx" ON "Customer"("organizationId", "fullName");

-- CreateIndex
CREATE INDEX "Vehicle_organizationId_licensePlate_idx" ON "Vehicle"("organizationId", "licensePlate");

-- CreateIndex
CREATE INDEX "Vehicle_organizationId_idx" ON "Vehicle"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_vin_key" ON "Vehicle"("vin");

-- CreateIndex
CREATE INDEX "VehicleOwnerHistory_vehicleId_idx" ON "VehicleOwnerHistory"("vehicleId");

-- CreateIndex
CREATE INDEX "VehicleOwnerHistory_customerId_idx" ON "VehicleOwnerHistory"("customerId");

-- CreateIndex
CREATE INDEX "Job_organizationId_status_idx" ON "Job"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Job_organizationId_vehicleId_idx" ON "Job"("organizationId", "vehicleId");

-- CreateIndex
CREATE INDEX "Job_organizationId_customerId_idx" ON "Job"("organizationId", "customerId");

-- CreateIndex
CREATE INDEX "JobStatusEvent_jobId_idx" ON "JobStatusEvent"("jobId");

-- CreateIndex
CREATE INDEX "Diagnosis_jobId_idx" ON "Diagnosis"("jobId");

-- CreateIndex
CREATE INDEX "Diagnosis_organizationId_idx" ON "Diagnosis"("organizationId");

-- CreateIndex
CREATE INDEX "Estimate_jobId_idx" ON "Estimate"("jobId");

-- CreateIndex
CREATE INDEX "Estimate_organizationId_idx" ON "Estimate"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_jobId_version_key" ON "Estimate"("jobId", "version");

-- CreateIndex
CREATE INDEX "EstimateItem_estimateId_idx" ON "EstimateItem"("estimateId");

-- CreateIndex
CREATE INDEX "Approval_jobId_idx" ON "Approval"("jobId");

-- CreateIndex
CREATE INDEX "Approval_estimateId_idx" ON "Approval"("estimateId");

-- CreateIndex
CREATE INDEX "Approval_organizationId_idx" ON "Approval"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalItemDecision_approvalId_estimateItemId_key" ON "ApprovalItemDecision"("approvalId", "estimateItemId");

-- CreateIndex
CREATE INDEX "JobPart_jobId_idx" ON "JobPart"("jobId");

-- CreateIndex
CREATE INDEX "JobPart_organizationId_idx" ON "JobPart"("organizationId");

-- CreateIndex
CREATE INDEX "JobLabor_jobId_idx" ON "JobLabor"("jobId");

-- CreateIndex
CREATE INDEX "JobLabor_organizationId_idx" ON "JobLabor"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_jobId_key" ON "Invoice"("jobId");

-- CreateIndex
CREATE INDEX "Invoice_jobId_idx" ON "Invoice"("jobId");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_idx" ON "Invoice"("organizationId");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_organizationId_idx" ON "Payment"("organizationId");

-- CreateIndex
CREATE INDEX "Attachment_organizationId_idx" ON "Attachment"("organizationId");

-- CreateIndex
CREATE INDEX "Attachment_jobId_idx" ON "Attachment"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRecord_jobId_key" ON "ServiceRecord"("jobId");

-- CreateIndex
CREATE INDEX "ServiceRecord_vehicleId_idx" ON "ServiceRecord"("vehicleId");

-- CreateIndex
CREATE INDEX "ServiceRecord_organizationId_idx" ON "ServiceRecord"("organizationId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_entityType_entityId_idx" ON "AuditLog"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Garage" ADD CONSTRAINT "Garage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_garageId_fkey" FOREIGN KEY ("garageId") REFERENCES "Garage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleOwnerHistory" ADD CONSTRAINT "VehicleOwnerHistory_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleOwnerHistory" ADD CONSTRAINT "VehicleOwnerHistory_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_garageId_fkey" FOREIGN KEY ("garageId") REFERENCES "Garage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_assignedTechnicianId_fkey" FOREIGN KEY ("assignedTechnicianId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStatusEvent" ADD CONSTRAINT "JobStatusEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateItem" ADD CONSTRAINT "EstimateItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_decidedByCustomerId_fkey" FOREIGN KEY ("decidedByCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalItemDecision" ADD CONSTRAINT "ApprovalItemDecision_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalItemDecision" ADD CONSTRAINT "ApprovalItemDecision_estimateItemId_fkey" FOREIGN KEY ("estimateItemId") REFERENCES "EstimateItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPart" ADD CONSTRAINT "JobPart_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLabor" ADD CONSTRAINT "JobLabor_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_diagnosisId_fkey" FOREIGN KEY ("diagnosisId") REFERENCES "Diagnosis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
