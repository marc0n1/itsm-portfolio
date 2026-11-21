-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'RATING';

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "csatAt" TIMESTAMP(3),
ADD COLUMN     "csatComment" TEXT,
ADD COLUMN     "csatScore" INTEGER;

-- A nota é de 1 a 5 (nulo = sem avaliação). O Prisma não expressa CHECK, então
-- fica aqui: o banco recusa qualquer valor fora do intervalo, mesmo que alguém
-- grave por fora da aplicação.
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_csatScore_range"
  CHECK ("csatScore" IS NULL OR ("csatScore" BETWEEN 1 AND 5));
