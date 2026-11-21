-- CreateEnum
CREATE TYPE "SlaClock" AS ENUM ('RESPONSE', 'RESOLUTION');

-- CreateEnum
CREATE TYPE "SlaAlertState" AS ENUM ('AT_RISK', 'BREACHED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SLA';

-- CreateTable
CREATE TABLE "SlaAlert" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "clock" "SlaClock" NOT NULL,
    "state" "SlaAlertState" NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlaAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlaAlert_ticketId_clock_state_dueAt_key" ON "SlaAlert"("ticketId", "clock", "state", "dueAt");

-- AddForeignKey
ALTER TABLE "SlaAlert" ADD CONSTRAINT "SlaAlert_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
