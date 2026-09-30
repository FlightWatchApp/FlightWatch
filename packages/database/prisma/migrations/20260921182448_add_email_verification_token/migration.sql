-- SPEC-010: token opaco (hash SHA-256) para confirmação de e-mail. Migração
-- puramente aditiva, colunas nullable — canais existentes ficam sem token até
-- um reenvio ser emitido.

-- AlterTable
ALTER TABLE "notification_channels" ADD COLUMN     "verificationTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "verificationTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "notification_channels_verificationTokenHash_key" ON "notification_channels"("verificationTokenHash");
