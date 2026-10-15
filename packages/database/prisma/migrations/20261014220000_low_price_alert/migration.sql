-- SPEC-039: alerta de preço baixo pelo histórico.
-- Migração puramente aditiva: valor novo no enum e colunas opcionais.

-- AlterEnum
ALTER TYPE "AlertRuleType" ADD VALUE 'LOW_PRICE';

-- AlterTable
ALTER TABLE "alert_rules" ADD COLUMN     "baselineAmountMinor" INTEGER,
ADD COLUMN     "baselineComputedAt" TIMESTAMP(3),
ADD COLUMN     "baselineSource" TEXT;
