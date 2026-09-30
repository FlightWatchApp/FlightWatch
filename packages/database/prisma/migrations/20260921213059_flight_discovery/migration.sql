-- CreateEnum
CREATE TYPE "FlightSearchStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "flight_searches" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "originIata" TEXT NOT NULL,
    "destinationIata" TEXT NOT NULL,
    "departureDate" DATE NOT NULL,
    "returnDate" DATE,
    "tripType" "TripType" NOT NULL,
    "cabin" TEXT NOT NULL,
    "adults" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "maxStops" INTEGER,
    "maxPriceMinor" INTEGER,
    "status" "FlightSearchStatus" NOT NULL DEFAULT 'PENDING',
    "providerStrategy" TEXT NOT NULL DEFAULT 'SIMULATED',
    "offersReturnedCount" INTEGER NOT NULL DEFAULT 0,
    "offersEligibleCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "flight_searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flight_search_offers" (
    "id" TEXT NOT NULL,
    "flightSearchId" TEXT NOT NULL,
    "providerStrategy" TEXT NOT NULL,
    "providerOfferId" TEXT NOT NULL,
    "totalAmountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "passengerCount" INTEGER NOT NULL,
    "itinerary" JSONB NOT NULL,
    "offerSignature" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "deeplink" TEXT,
    "qualityFlags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flight_search_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "flight_searches_userId_createdAt_idx" ON "flight_searches"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "flight_search_offers_flightSearchId_idx" ON "flight_search_offers"("flightSearchId");

-- AddForeignKey
ALTER TABLE "flight_searches" ADD CONSTRAINT "flight_searches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_search_offers" ADD CONSTRAINT "flight_search_offers_flightSearchId_fkey" FOREIGN KEY ("flightSearchId") REFERENCES "flight_searches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
