import { formatMoney } from './money';

/**
 * SPEC-045 parte B — texto pronto de uma promoção para a pessoa responsável
 * colar no grupo de WhatsApp. Só monta texto: nada é enviado. Mesmas regras do
 * site: o número é "o que observamos", com a idade, e o valor final é o do
 * site que vende (sem "menor preço do mercado", "garantido", "tempo real").
 */

export interface GroupMessageInput {
  originName: string;
  destinationName: string;
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  /** AAAA-MM-DD, sem fuso. */
  departureDate: string;
  returnDate: string | null;
  price: { amountMinor: number; currency: string };
  /** Pontos-base abaixo da mediana de referência (3400 = 34%). */
  discountBps: number;
  referenceMedianMinor: number;
  referencePointCount: number;
  stops: number;
  /** Quando a fonte viu o preço (ISO). */
  observedAt: string;
  /** Link já validado pela API (allowlist); null = a mensagem sai sem link. */
  purchaseUrl: string | null;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** "2026-11-20" → "20/11/2026", sem passar por Date (nada de fuso). */
function brDate(isoDate: string): string {
  return `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}/${isoDate.slice(0, 4)}`;
}

/** Intl usa espaço sem quebra depois do "R$"; em texto puro vale o espaço comum. */
function money(amountMinor: number, currency: string): string {
  return formatMoney({ amountMinor, currency }).replace(/\u00a0/g, ' ');
}

function stopsLabel(stops: number): string {
  if (stops === 0) return 'Direto';
  return stops === 1 ? '1 escala' : `${stops} escalas`;
}

function ageLabel(observedAt: string, now: Date): string {
  const elapsed = Math.max(0, now.getTime() - Date.parse(observedAt));
  if (elapsed < DAY_MS) {
    return `Visto há ${Math.max(1, Math.floor(elapsed / HOUR_MS))} h`;
  }
  const days = Math.floor(elapsed / DAY_MS);
  return `Visto há ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

export function buildGroupMessage(input: GroupMessageInput, now: Date = new Date()): string {
  const trip =
    input.tripType === 'ROUND_TRIP' && input.returnDate
      ? `Ida e volta · ${brDate(input.departureDate)} → ${brDate(input.returnDate)}`
      : `Só ida · ${brDate(input.departureDate)}`;
  const below =
    input.discountBps > 0
      ? ` — ${Math.round(input.discountBps / 100)}% abaixo da mediana dos ${input.referencePointCount} preços que observamos (${money(input.referenceMedianMinor, input.price.currency)})`
      : '';

  const lines = [
    `✈️ *${input.originName} → ${input.destinationName}*`,
    `${trip} · ${stopsLabel(input.stops)}`,
    `💰 *${money(input.price.amountMinor, input.price.currency)}*${below}`,
    `🕒 ${ageLabel(input.observedAt, now)}`,
  ];
  if (input.purchaseUrl) {
    lines.push(`🔗 ${input.purchaseUrl}`);
  }
  lines.push(
    '_Preço observado pelo Flight Watch: o site mostra os voos de agora e o valor pode ser diferente. Confirme o valor antes de comprar._',
  );
  return lines.join('\n');
}
