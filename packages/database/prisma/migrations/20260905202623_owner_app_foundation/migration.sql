/*
  Warnings:

  - Added the required column `body` to the `Notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `Notification` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TokenKind" AS ENUM ('STAFF', 'OWNER');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "body" TEXT NOT NULL,
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "title" TEXT NOT NULL,
ALTER COLUMN "payload" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "kind" "TokenKind" NOT NULL DEFAULT 'STAFF';

-- CreateTable
CREATE TABLE "CustomerLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerLink_userId_idx" ON "CustomerLink"("userId");

-- CreateIndex
CREATE INDEX "CustomerLink_customerId_idx" ON "CustomerLink"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLink_userId_customerId_key" ON "CustomerLink"("userId", "customerId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "CustomerLink" ADD CONSTRAINT "CustomerLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLink" ADD CONSTRAINT "CustomerLink_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
