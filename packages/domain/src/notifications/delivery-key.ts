import { createHash } from 'node:crypto';

export interface DeliveryKeyInput {
  alertEventId: string;
  channel: string;
  destinationVersion: number;
  templateVersion: number;
}

// SPEC-006 §5: SHA-256(alert_event_id|channel|destination_version|template_version).
// destination_version muda se o destino do canal for atualizado — evita que uma
// entrega enfileirada antes de uma troca de e-mail seja reaproveitada calada
// para o endereço novo.
export function computeDeliveryKey(input: DeliveryKeyInput): string {
  const raw = `${input.alertEventId}|${input.channel}|${input.destinationVersion}|${input.templateVersion}`;
  return createHash('sha256').update(raw).digest('hex');
}
