-- SPEC-029: catálogo de cidades e aeroportos sincronizado da Travelpayouts.
-- Migração puramente aditiva: enum e tabela novos, nada existente muda.

-- CreateEnum
CREATE TYPE "PlaceKind" AS ENUM ('CITY', 'AIRPORT');

-- CreateTable
CREATE TABLE "places" (
    "code" TEXT NOT NULL,
    "kind" "PlaceKind" NOT NULL,
    "name" TEXT NOT NULL,
    "cityCode" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "countryName" TEXT NOT NULL,
    "timeZone" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "searchable" BOOLEAN NOT NULL,
    "searchText" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "places_pkey" PRIMARY KEY ("code","kind")
);

-- CreateIndex
CREATE INDEX "places_kind_searchable_idx" ON "places"("kind", "searchable");

-- CreateIndex
CREATE INDEX "places_cityCode_idx" ON "places"("cityCode");

