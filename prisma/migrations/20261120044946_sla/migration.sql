/*
  Warnings:

  - You are about to drop the column `dueAt` on the `Ticket` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Ticket" DROP COLUMN "dueAt",
ADD COLUMN     "firstResponseAt" TIMESTAMP(3),
ADD COLUMN     "slaPausedAt" TIMESTAMP(3),
ADD COLUMN     "slaPausedSeconds" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SlaPolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "priority" "Priority" NOT NULL,
    "responseMinutes" INTEGER NOT NULL,
    "resolutionMinutes" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlaPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlaPolicy_organizationId_priority_key" ON "SlaPolicy"("organizationId", "priority");

-- AddForeignKey
ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: existing tickets get a first response (earliest public comment by
-- staff) and tickets currently WAITING start with their SLA clock paused.
UPDATE "Ticket" t
SET "firstResponseAt" = (
  SELECT MIN(c."createdAt")
  FROM "Comment" c
  JOIN "User" u ON u."id" = c."authorId"
  WHERE c."ticketId" = t."id"
    AND c."internal" = false
    AND u."role" IN ('ADMIN', 'AGENT')
);

UPDATE "Ticket"
SET "slaPausedAt" = "updatedAt"
WHERE "status" = 'WAITING';
