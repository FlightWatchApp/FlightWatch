import type {
  AlertEvent,
  NotificationChannel,
  NotificationDelivery,
  PriceObservation,
  Prisma,
  SearchTarget,
  User,
  Watch,
} from '@prisma/client';

export type AlertEventForDelivery = AlertEvent & {
  watch: Watch & {
    notificationChannel: NotificationChannel;
    searchTarget: SearchTarget;
    user: User;
  };
  priceObservation: PriceObservation;
};

export async function findAlertEventForDelivery(
  tx: Prisma.TransactionClient,
  alertEventId: string,
): Promise<AlertEventForDelivery | null> {
  return tx.alertEvent.findUnique({
    where: { id: alertEventId },
    include: {
      watch: { include: { notificationChannel: true, searchTarget: true, user: true } },
      priceObservation: true,
    },
  });
}

export interface CreateNotificationDeliveryInput {
  alertEventId: string;
  channel: NotificationDelivery['channel'];
  destinationRef: string;
  deliveryKey: string;
  // SPEC-012 §4: persistido para que a reconciliação de SENDING obsoleto saiba
  // qual versão de template reenviar — o payload efêmero do job original já
  // não existe mais nesse ponto.
  templateVersion: number;
}

/**
 * SPEC-006 §5: checa a deliveryKey antes de criar — mesmo padrão de
 * findOrCreateAlertEvent. Redelivery do job encontra o registro existente em
 * vez de tentar um insert que colidiria e abortaria a transação.
 */
export async function findOrCreateNotificationDelivery(
  tx: Prisma.TransactionClient,
  input: CreateNotificationDeliveryInput,
): Promise<{ delivery: NotificationDelivery; created: boolean }> {
  const existing = await tx.notificationDelivery.findUnique({
    where: { deliveryKey: input.deliveryKey },
  });
  if (existing) {
    return { delivery: existing, created: false };
  }
  const delivery = await tx.notificationDelivery.create({ data: { ...input, status: 'PENDING' } });
  return { delivery, created: true };
}

// PENDING: primeira tentativa. RETRYABLE_FAILURE: BullMQ redeliverou o job
// após uma falha temporária de envio.
const CLAIMABLE_DELIVERY_STATUSES: NotificationDelivery['status'][] = [
  'PENDING',
  'RETRYABLE_FAILURE',
];

/**
 * SPEC-006 §5/§6: reivindica a entrega antes de enviar, de forma atômica — um
 * único `UPDATE ... WHERE status IN (...)`, não um find+update separado (mesma
 * lição de claimSearchExecutionForRunning). Sem isso, duas entregas
 * concorrentes do mesmo job (redelivery do BullMQ sobrepondo a tentativa
 * original) liam `status !== 'DELIVERED'/'PERMANENT_FAILURE'` como verdadeiro
 * pras duas, e as duas chamavam `emailSender.send` — mensagem duplicada de
 * verdade pro usuário, não só um registro duplicado no banco. Retorna `null`
 * quando a corrida foi perdida (já SENDING/DELIVERED/PERMANENT_FAILURE).
 *
 * SPEC-012 §4: também aceita reivindicar uma entrega em `SENDING` cujo
 * `updatedAt` já passou de `staleSendingThresholdMs` — cobre o caso de o
 * mesmo job BullMQ ser redelivered (stalled-job detection) depois de o worker
 * ter caído no meio de um envio. Seguro porque `EmailSender.send()` é
 * contratualmente idempotente por `idempotencyKey` (mesmo `deliveryKey`) —
 * ver packages/notifications/src/email/port.ts.
 */
export async function claimNotificationDeliveryForSending(
  tx: Prisma.TransactionClient,
  deliveryId: string,
  staleSendingThresholdMs: number,
): Promise<NotificationDelivery | null> {
  const staleBefore = new Date(Date.now() - staleSendingThresholdMs);
  const claimed = await tx.notificationDelivery.updateMany({
    where: {
      id: deliveryId,
      OR: [
        { status: { in: CLAIMABLE_DELIVERY_STATUSES } },
        { status: 'SENDING', updatedAt: { lt: staleBefore } },
      ],
    },
    data: { status: 'SENDING', attempt: { increment: 1 } },
  });
  if (claimed.count === 0) {
    return null;
  }
  return tx.notificationDelivery.findUnique({ where: { id: deliveryId } });
}

export interface StaleSendingDeliveryRow {
  id: string;
  alertEventId: string;
  channel: NotificationDelivery['channel'];
  templateVersion: number | null;
}

/**
 * SPEC-012 §4: encontra e resolve (atomicamente, via `UPDATE ... RETURNING`)
 * entregas presas em `SENDING` além do threshold — o BullMQ pode nunca
 * redeliver o job original (ex.: se ele já tinha sido marcado concluído do
 * lado do BullMQ antes do crash). Move para `RETRYABLE_FAILURE` com um
 * `errorCode` auditável; o chamador (apps/notification-worker) é responsável
 * por publicar um novo job pra cada linha devolvida. Duas chamadas
 * concorrentes desta função nunca devolvem a mesma linha — cada uma só é
 * `SENDING` uma vez.
 */
export async function reconcileStaleSendingNotificationDeliveries(
  tx: Prisma.TransactionClient,
  staleBeforeMs: number,
): Promise<StaleSendingDeliveryRow[]> {
  const staleBefore = new Date(Date.now() - staleBeforeMs);
  return tx.$queryRaw<StaleSendingDeliveryRow[]>`
    UPDATE notification_deliveries
    SET status = 'RETRYABLE_FAILURE', "errorCode" = 'STALE_SENDING_LEASE', "updatedAt" = now()
    WHERE status = 'SENDING' AND "updatedAt" < ${staleBefore}
    RETURNING id, "alertEventId", channel, "templateVersion"
  `;
}

export interface MarkDeliveryResultInput {
  deliveryId: string;
  status: 'DELIVERED' | 'RETRYABLE_FAILURE' | 'PERMANENT_FAILURE';
  providerMessageId?: string;
  errorCode?: string;
}

export async function markNotificationDeliveryResult(
  tx: Prisma.TransactionClient,
  input: MarkDeliveryResultInput,
): Promise<void> {
  await tx.notificationDelivery.update({
    where: { id: input.deliveryId },
    data: {
      status: input.status,
      ...(input.providerMessageId !== undefined
        ? { providerMessageId: input.providerMessageId }
        : {}),
      ...(input.errorCode !== undefined ? { errorCode: input.errorCode } : {}),
    },
  });
}

export async function markAlertEventNotified(
  tx: Prisma.TransactionClient,
  alertEventId: string,
): Promise<void> {
  await tx.alertEvent.update({ where: { id: alertEventId }, data: { status: 'NOTIFIED' } });
}

export async function markAlertEventFailed(
  tx: Prisma.TransactionClient,
  alertEventId: string,
): Promise<void> {
  await tx.alertEvent.update({ where: { id: alertEventId }, data: { status: 'FAILED' } });
}
