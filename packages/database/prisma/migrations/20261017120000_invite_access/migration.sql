-- SPEC-043: convite, papel de admin, suspensão e cota mensal. Migração puramente aditiva.

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserAccessStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AccessInviteStatus" AS ENUM ('AVAILABLE', 'REDEEMED', 'REVOKED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "accessStatus" "UserAccessStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "monthlyWatchLimit" INTEGER,
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "access_invites" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "AccessInviteStatus" NOT NULL DEFAULT 'AVAILABLE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "redeemedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_invites_codeHash_key" ON "access_invites"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "access_invites_redeemedByUserId_key" ON "access_invites"("redeemedByUserId");

-- CreateIndex
CREATE INDEX "access_invites_email_status_idx" ON "access_invites"("email", "status");

-- CreateIndex
CREATE INDEX "access_invites_createdAt_idx" ON "access_invites"("createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_log_createdAt_idx" ON "admin_audit_log"("createdAt");

-- CreateIndex
CREATE INDEX "watches_userId_createdAt_idx" ON "watches"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "access_invites" ADD CONSTRAINT "access_invites_redeemedByUserId_fkey" FOREIGN KEY ("redeemedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

