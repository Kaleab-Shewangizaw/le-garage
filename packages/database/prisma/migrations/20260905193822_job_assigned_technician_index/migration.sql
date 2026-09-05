-- CreateIndex
CREATE INDEX "Job_organizationId_assignedTechnicianId_idx" ON "Job"("organizationId", "assignedTechnicianId");
