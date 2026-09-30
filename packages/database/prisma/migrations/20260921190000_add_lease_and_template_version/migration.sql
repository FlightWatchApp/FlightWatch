-- SPEC-011 (fencing) + SPEC-012 (recuperação de SENDING obsoleto). Migração
-- puramente aditiva, colunas nullable.

-- AlterTable
ALTER TABLE "notification_deliveries" ADD COLUMN     "templateVersion" INTEGER;

-- AlterTable
ALTER TABLE "search_executions" ADD COLUMN     "leaseToken" TEXT;
