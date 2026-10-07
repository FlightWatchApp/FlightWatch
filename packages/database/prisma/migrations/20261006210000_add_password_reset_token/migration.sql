-- SPEC-026: token de redefinição de senha (hash SHA-256) e prazo. Migração
-- puramente aditiva, colunas nullable — usuários existentes ficam sem token.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "passwordResetExpiresAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_passwordResetTokenHash_key" ON "users"("passwordResetTokenHash");

