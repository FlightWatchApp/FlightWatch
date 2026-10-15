export type AlertTriggerType =
  'TARGET_PRICE' | 'PERCENTAGE_DROP' | 'ABSOLUTE_DROP' | 'NEW_OBSERVED_LOW' | 'LOW_PRICE';

/** SPEC-039: por que o alerta de preço baixo disparou (da justificativa do AlertEvent). */
export interface LowPriceEmailDetails {
  belowTypical: boolean;
  lowestObserved: boolean;
  /** Preço normal usado na comparação; null se só valeu o menor já observado. */
  typicalAmountMinor: number | null;
}

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
  /** Só para `LOW_PRICE`. */
  lowPrice?: LowPriceEmailDetails | null;
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
    case 'LOW_PRICE':
      return 'O preço está bem abaixo do que costumamos observar para esta viagem.';
  }
}

/** SPEC-039: "20% abaixo do preço normal (R$ 450,00)" e/ou "menor já observado". */
function lowPriceLines(data: AlertEmailTemplateData): string[] {
  const details = data.lowPrice;
  if (!details) return [ruleExplanation('LOW_PRICE')];
  const lines: string[] = [];
  const typical = details.typicalAmountMinor;
  if (details.belowTypical && typical !== null && typical > 0) {
    const percent = Math.floor(((typical - data.currentAmountMinor) * 100) / typical);
    lines.push(
      `${percent}% abaixo do preço normal desta viagem (${formatMoney(typical, data.currency)}).`,
    );
  }
  if (details.lowestObserved) {
    lines.push('É o menor preço já observado pelo Flight Watch para esta viagem.');
  }
  return lines.length > 0 ? lines : [ruleExplanation('LOW_PRICE')];
}

export function renderAlertEmail(data: AlertEmailTemplateData): RenderedEmail {
  const origin = sanitizeLine(data.origin);
  const destination = sanitizeLine(data.destination);
  const currentFormatted = formatMoney(data.currentAmountMinor, data.currency);
  if (data.triggerType === 'LOW_PRICE') {
    return renderLowPriceEmail(data, origin, destination, currentFormatted);
  }
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
    `Pausar, ajustar ou encerrar este monitoramento: ${data.unsubscribeUrl}`,
  ].filter((line): line is string => line !== null);

  return { subject, textBody: lines.join('\n'), templateVersion: ALERT_EMAIL_TEMPLATE_VERSION };
}

function renderLowPriceEmail(
  data: AlertEmailTemplateData,
  origin: string,
  destination: string,
  currentFormatted: string,
): RenderedEmail {
  const lines = [
    `${currentFormatted} para ${origin} → ${destination}.`,
    `Data da ida: ${sanitizeLine(data.departureDate)}${
      data.returnDate ? ` · Volta: ${sanitizeLine(data.returnDate)}` : ''
    }`,
    '',
    ...lowPriceLines(data),
    '',
    `Preço observado em ${formatObservedAt(data.observedAt, data.userTimezone)}. Preço e disponibilidade podem mudar até a compra.`,
    '',
    `Ver, pausar ou encerrar este monitoramento: ${data.unsubscribeUrl}`,
  ];
  return {
    subject: `Preço baixo: ${origin} → ${destination} por ${currentFormatted}`,
    textBody: lines.join('\n'),
    templateVersion: ALERT_EMAIL_TEMPLATE_VERSION,
  };
}
