-- DropIndex
DROP INDEX "Invoice_jobId_key";

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "version" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "JobNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "authorStaffId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobNote_jobId_idx" ON "JobNote"("jobId");

-- CreateIndex
CREATE INDEX "JobNote_organizationId_idx" ON "JobNote"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_jobId_version_key" ON "Invoice"("jobId", "version");

-- AddForeignKey
ALTER TABLE "JobNote" ADD CONSTRAINT "JobNote_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

