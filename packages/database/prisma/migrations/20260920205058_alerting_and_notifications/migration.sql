-- CreateEnum
CREATE TYPE "AlertEventStatus" AS ENUM ('PENDING', 'SUPPRESSED', 'QUEUED', 'NOTIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'DELIVERED', 'RETRYABLE_FAILURE', 'PERMANENT_FAILURE');

-- AlterTable
ALTER TABLE "notification_channels" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "alert_events" (
    "id" TEXT NOT NULL,
    "watchId" TEXT NOT NULL,
    "alertRuleId" TEXT NOT NULL,
    "priceObservationId" TEXT NOT NULL,
    "triggerType" "AlertRuleType" NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "referenceAmountMinor" INTEGER,
    "currentAmountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "status" "AlertEventStatus" NOT NULL DEFAULT 'PENDING',
    "suppressionReason" TEXT,
    "justification" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" TEXT NOT NULL,
    "alertEventId" TEXT NOT NULL,
    "channel" "NotificationChannelType" NOT NULL,
    "destinationRef" TEXT NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "providerMessageId" TEXT,
    "deliveryKey" TEXT NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alert_events_deduplicationKey_key" ON "alert_events"("deduplicationKey");

-- CreateIndex
CREATE INDEX "alert_events_watchId_alertRuleId_status_idx" ON "alert_events"("watchId", "alertRuleId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_deliveryKey_key" ON "notification_deliveries"("deliveryKey");

-- CreateIndex
CREATE INDEX "notification_deliveries_alertEventId_status_idx" ON "notification_deliveries"("alertEventId", "status");

-- AddForeignKey
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_watchId_fkey" FOREIGN KEY ("watchId") REFERENCES "watches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_alertRuleId_fkey" FOREIGN KEY ("alertRuleId") REFERENCES "alert_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_priceObservationId_fkey" FOREIGN KEY ("priceObservationId") REFERENCES "price_observations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_alertEventId_fkey" FOREIGN KEY ("alertEventId") REFERENCES "alert_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
