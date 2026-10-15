-- SPEC-040: cidade de partida na conta. Migração puramente aditiva.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "homeCityCode" TEXT;
