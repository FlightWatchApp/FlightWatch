export type AlertTriggerType =
  'TARGET_PRICE' | 'PERCENTAGE_DROP' | 'ABSOLUTE_DROP' | 'NEW_OBSERVED_LOW';

export interface AlertEmailTemplateData {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string | null;
  currentAmountMinor: number;
  currency: string;
  triggerType: AlertTriggerType;
  referenceAmountMinor: number | null;
  observedAt: string;
  userTimezone: string;
  unsubscribeUrl: string;
}

export const ALERT_EMAIL_TEMPLATE_VERSION = 1;

export interface RenderedEmail {
  subject: string;
  textBody: string;
  templateVersion: number;
}

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amountMinor / 100);
}

function formatObservedAt(observedAtIso: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(observedAtIso));
}

// Sem HTML/markup — texto puro; uma quebra de linha inesperada em dado vindo de
// itinerário externo não deve desalinhar o corpo da mensagem.
function sanitizeLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

// SPEC-006 §4: nunca afirmar "menor preço do mercado" — só o que o sistema observou.
function ruleExplanation(triggerType: AlertTriggerType): string {
  switch (triggerType) {
    case 'TARGET_PRICE':
      return 'O preço atingiu ou ficou abaixo do valor-alvo que você configurou.';
    case 'PERCENTAGE_DROP':
    case 'ABSOLUTE_DROP':
      return 'O preço caiu em relação à última observação registrada para este monitoramento.';
    case 'NEW_OBSERVED_LOW':
      return 'Este é o novo menor preço observado desde o início deste monitoramento.';
  }
}

export function renderAlertEmail(data: AlertEmailTemplateData): RenderedEmail {
  const origin = sanitizeLine(data.origin);
  const destination = sanitizeLine(data.destination);
  const currentFormatted = formatMoney(data.currentAmountMinor, data.currency);
  const subject = `Alerta de preço: ${origin} → ${destination} por ${currentFormatted}`;

  const lines = [
    `Encontramos uma atualização no seu monitoramento ${origin} → ${destination}.`,
    '',
    `Preço observado: ${currentFormatted}`,
    data.referenceAmountMinor !== null
      ? `Referência de comparação: ${formatMoney(data.referenceAmountMinor, data.currency)}`
      : null,
    `Data da ida: ${sanitizeLine(data.departureDate)}${
      data.returnDate ? ` · Volta: ${sanitizeLine(data.returnDate)}` : ''
    }`,
    '',
    ruleExplanation(data.triggerType),
    '',
    `Observado em: ${formatObservedAt(data.observedAt, data.userTimezone)}. Preço e disponibilidade podem mudar até a compra.`,
    '',
    `Cancelar ou ajustar este monitoramento: ${data.unsubscribeUrl}`,
  ].filter((line): line is string => line !== null);

  return { subject, textBody: lines.join('\n'), templateVersion: ALERT_EMAIL_TEMPLATE_VERSION };
}
