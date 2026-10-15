-- SPEC-038: catálogo de companhias aéreas. Migração puramente aditiva.

-- CreateTable
CREATE TABLE "airlines" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "airlines_pkey" PRIMARY KEY ("code")
);
