-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "shareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_shareToken_key" ON "Estimate"("shareToken");

