const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

function monthName(month: string): string {
  return MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month;
}

/** "em outubro de 2026" / "entre outubro e dezembro de 2026" / "entre dezembro de 2026 e janeiro de 2027". */
function monthsPhrase(months: readonly string[]): string {
  const first = months[0];
  const last = months[months.length - 1];
  if (!first || !last) return '';
  if (first === last) return `em ${monthName(first)} de ${first.slice(0, 4)}`;
  if (first.slice(0, 4) === last.slice(0, 4)) {
    return `entre ${monthName(first)} e ${monthName(last)} de ${first.slice(0, 4)}`;
  }
  return `entre ${monthName(first)} de ${first.slice(0, 4)} e ${monthName(last)} de ${last.slice(0, 4)}`;
}

/** Arredondamento só na apresentação: centavos aparecem quando existem. */
export function formatPromotionMoney(amountMinor: number, currency: string): string {
  const digits = amountMinor % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
    .format(amountMinor / 100)
    .replace(/\u00a0/g, ' ');
}

/**
 * SPEC-032: texto pronto em pt-BR, conferível à mão contra o calendário da
 * rota — "R$ 590 está 31% abaixo da mediana de 24 preços encontrados para
 * Campo Grande → Salvador entre outubro e dezembro de 2026". O percentual é
 * arredondado para baixo, como o desconto.
 */
export function explainPromotion(input: {
  amountMinor: number;
  currency: string;
  discountBps: number;
  referencePointCount: number;
  originName: string;
  destinationName: string;
  months: readonly string[];
}): string {
  const percent = Math.floor(input.discountBps / 100);
  return (
    `${formatPromotionMoney(input.amountMinor, input.currency)} está ${percent}% abaixo da ` +
    `mediana de ${input.referencePointCount} preços encontrados para ` +
    `${input.originName} → ${input.destinationName} ${monthsPhrase(input.months)}.`
  );
}
