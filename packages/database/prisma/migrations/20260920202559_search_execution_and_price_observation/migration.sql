-- CreateEnum
CREATE TYPE "SearchExecutionStatus" AS ENUM ('SCHEDULED', 'RUNNING', 'SUCCEEDED', 'NO_OFFERS', 'RETRYABLE_FAILURE', 'PERMANENT_FAILURE', 'RATE_LIMITED');

-- CreateTable
CREATE TABLE "search_executions" (
    "id" TEXT NOT NULL,
    "searchTargetId" TEXT NOT NULL,
    "providerStrategy" TEXT NOT NULL,
    "status" "SearchExecutionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "latencyMs" INTEGER,
    "errorCode" TEXT,
    "offersCount" INTEGER,
    "costUnits" INTEGER,
    "normalizerVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_observations" (
    "id" TEXT NOT NULL,
    "searchTargetId" TEXT NOT NULL,
    "searchExecutionId" TEXT NOT NULL,
    "providerStrategy" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "totalAmountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "baseAmountMinor" INTEGER,
    "taxAmountMinor" INTEGER,
    "itinerary" JSONB NOT NULL,
    "offerSignature" TEXT NOT NULL,
    "deeplink" TEXT,
    "expiresAt" TIMESTAMP(3),
    "qualityFlags" TEXT[],
    "observationKey" TEXT NOT NULL,
    "selectionPolicyVersion" INTEGER NOT NULL,
    "normalizerVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "search_executions_idempotencyKey_key" ON "search_executions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "search_executions_searchTargetId_status_idx" ON "search_executions"("searchTargetId", "status");

-- CreateIndex
CREATE INDEX "search_executions_status_scheduledAt_idx" ON "search_executions"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "price_observations_searchExecutionId_key" ON "price_observations"("searchExecutionId");

-- CreateIndex
CREATE UNIQUE INDEX "price_observations_observationKey_key" ON "price_observations"("observationKey");

-- CreateIndex
CREATE INDEX "price_observations_searchTargetId_observedAt_idx" ON "price_observations"("searchTargetId", "observedAt" DESC);

-- AddForeignKey
ALTER TABLE "search_executions" ADD CONSTRAINT "search_executions_searchTargetId_fkey" FOREIGN KEY ("searchTargetId") REFERENCES "search_targets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_searchTargetId_fkey" FOREIGN KEY ("searchTargetId") REFERENCES "search_targets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_searchExecutionId_fkey" FOREIGN KEY ("searchExecutionId") REFERENCES "search_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
