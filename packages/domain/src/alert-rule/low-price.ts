import { type Money, assertSameCurrency } from '../money/money.js';
import { type PromotionPrice, invalidPriceReason, medianMinor } from '../promotion/promotion.js';

/**
 * SPEC-039 — alerta de preço baixo pelo histórico. Uma regra só, sem
 * parâmetro do usuário: dispara com preço `dropPercent`% abaixo do preço
 * normal ou abaixo do menor preço já observado da viagem. Tudo em inteiros
 * (H03); quem chama já agregou as observações e injeta tudo (função pura).
 */

/** Janela do histórico próprio que forma o preço normal. */
export const LOW_PRICE_HISTORY_WINDOW_DAYS = 30;
/** Dias com observação necessários para o histórico próprio valer. */
export const LOW_PRICE_MIN_HISTORY_DAYS = 5;
/** Janela do "menor já observado". */
export const LOW_PRICE_LOWEST_WINDOW_DAYS = 90;
/** Limites aceitos para a porcentagem fixada pela operação. */
export const LOW_PRICE_MIN_DROP_PERCENT = 5;
export const LOW_PRICE_MAX_DROP_PERCENT = 50;

export type TypicalPriceSource = 'HISTORY' | 'NEARBY_DATES';
export type LowPriceReason = 'BELOW_TYPICAL' | 'LOWEST_OBSERVED';

export interface DailyLow {
  /** AAAA-MM-DD (UTC) do dia em que o preço foi observado. */
  day: string;
  amountMinor: number;
}

export interface TypicalPrice {
  amountMinor: number;
  source: TypicalPriceSource;
  /** Dias de histórico próprio disponíveis (mesmo quando a fonte é a linha de base). */
  historyDays: number;
}

export function lowPriceDropPercentIsValid(percent: number): boolean {
  return (
    Number.isInteger(percent) &&
    percent >= LOW_PRICE_MIN_DROP_PERCENT &&
    percent <= LOW_PRICE_MAX_DROP_PERCENT
  );
}

/**
 * Preço normal: mediana do menor preço de cada dia (histórico próprio) com
 * pelo menos `LOW_PRICE_MIN_HISTORY_DAYS` dias; senão, a linha de base das
 * datas próximas gravada na criação do Watch; senão, nenhum.
 */
export function resolveTypicalPrice(input: {
  dailyLows: readonly DailyLow[];
  baselineAmountMinor: number | null;
}): TypicalPrice | null {
  const historyDays = input.dailyLows.length;
  if (historyDays >= LOW_PRICE_MIN_HISTORY_DAYS) {
    return {
      amountMinor: medianMinor(input.dailyLows.map((low) => low.amountMinor)),
      source: 'HISTORY',
      historyDays,
    };
  }
  if (input.baselineAmountMinor !== null && input.baselineAmountMinor > 0) {
    return { amountMinor: input.baselineAmountMinor, source: 'NEARBY_DATES', historyDays };
  }
  return null;
}

/** Maior preço que ainda conta como "bem abaixo do normal" (arredonda para baixo). */
export function lowPriceThresholdMinor(typicalAmountMinor: number, dropPercent: number): number {
  return Math.floor((typicalAmountMinor * (100 - dropPercent)) / 100);
}

export interface LowPriceRuleResult {
  triggered: boolean;
  /** Motivos que valeram, mesmo quando o disparo foi bloqueado. */
  reasons: LowPriceReason[];
  /** Maior preço que ainda conta como "abaixo do normal"; null sem preço normal. */
  thresholdAmountMinor: number | null;
  blockedBy?: 'NOT_BELOW_LAST_ALERT';
  noReference?: true;
}

export function evaluateLowPriceRule(params: {
  currentAmount: Money;
  typicalAmount: Money | null;
  lowestAmount: Money | null;
  /** Inteiro de 5 a 50, gravado na regra. */
  dropPercent: number;
  /** Preço do último alerta enviado desta regra (QUEUED/NOTIFIED); null se nunca houve. */
  lastAlertAmount: Money | null;
}): LowPriceRuleResult {
  const { currentAmount, typicalAmount, lowestAmount, lastAlertAmount } = params;
  if (!lowPriceDropPercentIsValid(params.dropPercent)) {
    throw new Error(`low price drop percent out of range: ${params.dropPercent}`);
  }
  if (typicalAmount === null && lowestAmount === null) {
    return { triggered: false, reasons: [], noReference: true, thresholdAmountMinor: null };
  }

  const reasons: LowPriceReason[] = [];
  let thresholdAmountMinor: number | null = null;
  if (typicalAmount !== null) {
    assertSameCurrency(currentAmount, typicalAmount);
    // atual ≤ normal × (100 − p) / 100, sem divisão: atual × 100 ≤ normal × (100 − p).
    const keep = 100 - params.dropPercent;
    thresholdAmountMinor = lowPriceThresholdMinor(typicalAmount.amountMinor, params.dropPercent);
    if (currentAmount.amountMinor * 100 <= typicalAmount.amountMinor * keep) {
      reasons.push('BELOW_TYPICAL');
    }
  }
  if (lowestAmount !== null) {
    assertSameCurrency(currentAmount, lowestAmount);
    if (currentAmount.amountMinor < lowestAmount.amountMinor) {
      reasons.push('LOWEST_OBSERVED');
    }
  }

  if (reasons.length === 0) {
    return { triggered: false, reasons, thresholdAmountMinor };
  }
  if (lastAlertAmount !== null) {
    assertSameCurrency(currentAmount, lastAlertAmount);
    if (currentAmount.amountMinor >= lastAlertAmount.amountMinor) {
      return { triggered: false, reasons, thresholdAmountMinor, blockedBy: 'NOT_BELOW_LAST_ALERT' };
    }
  }
  return { triggered: true, reasons, thresholdAmountMinor };
}

/**
 * Linha de base das datas próximas (SPEC-039 §"Linha de base"): mediana dos
 * preços válidos da mesma rota nas outras datas dos meses vizinhos — mesmas
 * regras de validade das promoções (SPEC-032: moeda, data passada, 72 h). A
 * própria data da viagem fica fora. Com menos de `LOW_PRICE_MIN_HISTORY_DAYS`
 * datas, não há linha de base.
 */
export function nearbyDatesBaseline(input: {
  prices: readonly PromotionPrice[];
  departureDate: string;
  currency: string;
  now: Date;
}): { amountMinor: number; points: number } | null {
  const cheapestByDate = new Map<string, number>();
  for (const price of input.prices) {
    if (price.departureDate === input.departureDate) continue;
    if (invalidPriceReason(price, input.currency, input.now) !== null) continue;
    const current = cheapestByDate.get(price.departureDate);
    if (current === undefined || price.amountMinor < current) {
      cheapestByDate.set(price.departureDate, price.amountMinor);
    }
  }
  const amounts = [...cheapestByDate.values()];
  if (amounts.length < LOW_PRICE_MIN_HISTORY_DAYS) return null;
  return { amountMinor: medianMinor(amounts), points: amounts.length };
}
