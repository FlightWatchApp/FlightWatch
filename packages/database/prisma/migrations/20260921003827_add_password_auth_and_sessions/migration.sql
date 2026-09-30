/*
  Warnings:

  - Added the required column `passwordHash` to the `users` table without a default value. This is not possible if the table is not empty.

  Esta migração é segura apenas porque não existem usuários reais ainda — as
  únicas linhas hoje são dados de seed/dev locais (packages/database/prisma/seed.ts).
  Backfill com placeholder inválido (nenhum hash Argon2id real começa assim,
  então nenhuma senha jamais bate contra ele) até `pnpm prisma:seed` re-popular
  com um hash de verdade. NÃO reutilizar este padrão de "NOT NULL sem default"
  uma vez que existam usuários reais — seria expand/backfill/contract em
  migrações separadas.
*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "passwordHash" TEXT;

UPDATE "users" SET "passwordHash" = 'MIGRATION_PLACEHOLDER_NO_VALID_HASH_MATCHES_THIS' WHERE "passwordHash" IS NULL;

ALTER TABLE "users" ALTER COLUMN "passwordHash" SET NOT NULL;

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
