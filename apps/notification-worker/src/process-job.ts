import type { Job } from 'bullmq';
import {
  type PrismaClient,
  claimNotificationDeliveryForSending,
  findAlertEventForDelivery,
  findOrCreateNotificationDelivery,
  markAlertEventFailed,
  markAlertEventNotified,
  markNotificationDeliveryResult,
  withUniqueConstraintRetry,
} from '@flight-watch/database';
import { computeDeliveryKey } from '@flight-watch/domain';
import {
  EmailDeliveryError,
  type EmailSender,
  renderAlertEmail,
} from '@flight-watch/notifications';
import type { NotificationRequestedJob } from '@flight-watch/queue';
import type { NotificationWorkerMetrics } from './metrics.js';

// SPEC-012 §4: bem acima da latência esperada de um envio real — só entregas
// genuinamente presas (worker morto no meio do envio) devem ser reivindicadas
// de novo por aqui.
export const STALE_SENDING_THRESHOLD_MS = Number(
  process.env.NOTIFICATION_STALE_SENDING_THRESHOLD_MS ?? 5 * 60 * 1000,
);

export interface NotificationWorkerDeps {
  prisma: PrismaClient;
  emailSender: EmailSender;
  buildUnsubscribeUrl: (watchId: string) => string;
  metrics: NotificationWorkerMetrics;
}

/**
 * SPEC-006 §6: consome `NotificationRequested.v1`, renderiza o template com os
 * dados já persistidos no AlertEvent (nunca recalcula com regra/preço atual —
 * a mensagem tem que corresponder exatamente ao que gerou o alerta) e entrega
 * pelo canal resolvido no momento do envio (não o que estava no job).
 */
export async function processNotificationJob(
  deps: NotificationWorkerDeps,
  job: Job<NotificationRequestedJob>,
): Promise<void> {
  const { prisma, emailSender, buildUnsubscribeUrl, metrics } = deps;
  const data = job.data;

  const alertEvent = await prisma.$transaction((tx) =>
    findAlertEventForDelivery(tx, data.alertEventId),
  );
  if (!alertEvent) {
    return; // evento inexistente/incompatível — DLQ implícito, nada a buscar de novo.
  }
  if (alertEvent.status !== 'QUEUED') {
    return; // NOTIFIED/FAILED/SUPPRESSED: já resolvido, não reprocessa.
  }

  const channel = alertEvent.watch.notificationChannel;
  const alertEventCreatedAt = alertEvent.createdAt;
  // BullMQ desserializa dados externos ao processo; o tipo TypeScript não é
  // validação em runtime. Labels precisam continuar fechados mesmo se um job
  // corrompido/antigo trouxer valores inesperados.
  const metricChannel = data.channel === 'EMAIL' ? 'EMAIL' : 'UNKNOWN';
  const metricTemplateVersion =
    Number.isInteger(data.templateVersion) &&
    data.templateVersion >= 1 &&
    data.templateVersion <= 100
      ? String(data.templateVersion)
      : 'UNKNOWN';
  const deliveryKey = computeDeliveryKey({
    alertEventId: alertEvent.id,
    channel: data.channel,
    destinationVersion: channel.version,
    templateVersion: data.templateVersion,
  });

  function recordDelivery(status: 'delivered' | 'retryable_failure' | 'permanent_failure'): void {
    metrics.deliveriesTotal.inc({
      channel: metricChannel,
      status,
      templateVersion: metricTemplateVersion,
    });
    // Um retryable_failure ainda não resolveu a entrega. O lag deve ser
    // observado somente no desfecho terminal, senão uma única notificação
    // gera um valor de lag por tentativa e distorce o histograma.
    if (status !== 'retryable_failure') {
      metrics.deliveryLagSeconds.observe(
        { channel: metricChannel },
        Math.max(0, (Date.now() - alertEventCreatedAt.getTime()) / 1000),
      );
    }
  }

  // EVAL-NOTIFY-004: canal não verificado/revogado -> suprime a entrega. Precisa
  // de um registro terminal e auditável — um "return" simples aqui deixava o
  // AlertEvent preso em QUEUED para sempre, sem NotificationDelivery nenhuma
  // provando que o sistema tentou e por que não enviou.
  if (channel.status !== 'ACTIVE' || !channel.verifiedAt) {
    await withUniqueConstraintRetry(
      () =>
        prisma.$transaction(async (tx) => {
          const { delivery } = await findOrCreateNotificationDelivery(tx, {
            alertEventId: alertEvent.id,
            channel: data.channel,
            destinationRef: channel.id,
            deliveryKey,
            templateVersion: data.templateVersion,
          });
          await markNotificationDeliveryResult(tx, {
            deliveryId: delivery.id,
            status: 'PERMANENT_FAILURE',
            errorCode: 'CHANNEL_NOT_VERIFIED',
          });
          await markAlertEventFailed(tx, alertEvent.id);
        }),
      'deliveryKey',
    );
    recordDelivery('permanent_failure');
    return;
  }

  const { delivery } = await withUniqueConstraintRetry(
    () =>
      prisma.$transaction((tx) =>
        findOrCreateNotificationDelivery(tx, {
          alertEventId: alertEvent.id,
          channel: data.channel,
          destinationRef: channel.id,
          deliveryKey,
          templateVersion: data.templateVersion,
        }),
      ),
    'deliveryKey',
  );

  // AC-002 (SPEC-006): redelivery do job não gera segunda mensagem lógica.
  // A reivindicação é atômica (claimNotificationDeliveryForSending) — cobre
  // tanto os estados terminais (DELIVERED/PERMANENT_FAILURE) quanto o caso de
  // outra entrega concorrente já ter reivindicado (SENDING), sem a janela de
  // corrida entre checar o status e escrevê-lo que existia antes. SPEC-012:
  // também aceita reivindicar uma SENDING obsoleta (ver STALE_SENDING_THRESHOLD_MS).
  const claimed = await prisma.$transaction((tx) =>
    claimNotificationDeliveryForSending(tx, delivery.id, STALE_SENDING_THRESHOLD_MS),
  );
  if (!claimed) {
    metrics.duplicateDeliveriesPreventedTotal.inc();
    return;
  }
  metrics.deliveryAttemptsTotal.inc({ channel: metricChannel });

  const rendered = renderAlertEmail({
    origin: alertEvent.watch.searchTarget.originIata,
    destination: alertEvent.watch.searchTarget.destinationIata,
    departureDate: alertEvent.watch.searchTarget.departureDate.toISOString().slice(0, 10),
    returnDate: alertEvent.watch.searchTarget.returnDate
      ? alertEvent.watch.searchTarget.returnDate.toISOString().slice(0, 10)
      : null,
    currentAmountMinor: alertEvent.currentAmountMinor,
    currency: alertEvent.currency,
    triggerType: alertEvent.triggerType,
    referenceAmountMinor: alertEvent.referenceAmountMinor,
    observedAt: alertEvent.priceObservation.observedAt.toISOString(),
    userTimezone: alertEvent.watch.user.timezone,
    unsubscribeUrl: buildUnsubscribeUrl(alertEvent.watchId),
  });

  try {
    const result = await emailSender.send({
      to: channel.destination,
      subject: rendered.subject,
      textBody: rendered.textBody,
      idempotencyKey: deliveryKey,
    });

    await prisma.$transaction(async (tx) => {
      await markNotificationDeliveryResult(tx, {
        deliveryId: delivery.id,
        status: 'DELIVERED',
        providerMessageId: result.providerMessageId,
      });
      await markAlertEventNotified(tx, alertEvent.id);
    });
    recordDelivery('delivered');
  } catch (error) {
    const deliveryError =
      error instanceof EmailDeliveryError
        ? error
        : new EmailDeliveryError('TEMPORARY_UNAVAILABLE', String(error));

    await prisma.$transaction(async (tx) => {
      await markNotificationDeliveryResult(tx, {
        deliveryId: delivery.id,
        status: deliveryError.retryable ? 'RETRYABLE_FAILURE' : 'PERMANENT_FAILURE',
        errorCode: deliveryError.errorClass,
      });
      if (!deliveryError.retryable) {
        await markAlertEventFailed(tx, alertEvent.id);
      }
    });
    recordDelivery(deliveryError.retryable ? 'retryable_failure' : 'permanent_failure');

    if (deliveryError.retryable) {
      // Relança para o BullMQ reagendar conforme o backoff configurado na fila.
      throw deliveryError;
    }
  }
}
