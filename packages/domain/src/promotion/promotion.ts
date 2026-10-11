/**
 * SPEC-032 — promoção é dado derivado: uma conclusão do Flight Watch a partir
 * de preços da fonte, calculada sob demanda e nunca gravada (D1, DR-019).
 *
 * A referência é a mediana dos preços da mesma rota nas datas próximas (mês
 * da data e vizinhos). O que ela mede, e é isso que a tela diz: "mais barato
 * que as outras datas próximas nesta rota" — não "mais barato que o normal",
 * que exige histórico próprio (SPEC-033).
 *
 * Tudo em inteiros: dinheiro em unidade mínima, desconto em pontos-base.
 * Nenhum float decide limiar. Relógio sempre injetado.
 */

const HOUR_MS = 60 * 60 * 1000;

/** Preço visto pela fonte há mais que isso não vale como atual (SPEC-030). */
export const PROMOTION_MAX_PRICE_AGE_MS = 72 * HOUR_MS;
/** Até aqui o preço é exibido normalmente; depois, com "pode ter mudado". */
export const PROMOTION_RECENT_PRICE_AGE_MS = 24 * HOUR_MS;
/** Desconto em que o componente de desconto do score satura. */
export const PROMOTION_DISCOUNT_SCORE_SATURATION_BPS = 5000;
export const PROMOTION_SCORE_VERSION = 1;

const BPS = 10_000;

export type PromotionScope = 'DOMESTIC' | 'INTERNATIONAL';
export type PromotionFreshness = 'RECENT' | 'AGING' | 'EXPIRED';
export type InvalidPriceReason = 'NON_POSITIVE' | 'CURRENCY' | 'PAST_DATE' | 'TOO_OLD';

export interface PromotionPolicy {
  minReferencePoints: number;
  minDomesticDiscountBps: number;
  minInternationalDiscountBps: number;
  /** A partir deste desconto o preço é suspeito e nunca vai ao feed. */
  suspectDiscountBps: number;
  savingScoreCapMinor: number;
}

/** Valores iniciais da SPEC-032; a configuração da API pode trocá-los. */
export const DEFAULT_PROMOTION_POLICY: PromotionPolicy = {
  minReferencePoints: 8,
  minDomesticDiscountBps: 1500,
  minInternationalDiscountBps: 2000,
  suspectDiscountBps: 7000,
  savingScoreCapMinor: 100_000,
};

/** Um preço da fonte para uma data de partida. */
export interface PromotionPrice {
  /** AAAA-MM-DD */
  departureDate: string;
  amountMinor: number;
  currency: string;
  /** Quando a fonte viu o preço (SPEC-030). */
  observedAt: string;
}

export interface PromotionInput {
  candidate: PromotionPrice;
  /** Moeda pedida; preço em outra moeda é inválido e nunca é comparado. */
  currency: string;
  scope: PromotionScope;
  /**
   * Preços da mesma rota e tipo de viagem nos meses de `referenceMonths`. Em
   * ida e volta, quem chama já filtrou pela mesma duração (SPEC-031).
   */
  referencePrices: readonly PromotionPrice[];
}

export interface PromotionView {
  discountBps: number;
  absoluteSavingMinor: number;
  referenceAmountMinor: number;
  referencePointCount: number;
  /** Meses (AAAA-MM) que contribuíram com preço para a referência, em ordem. */
  referenceMonths: string[];
  score: number;
  scoreVersion: typeof PROMOTION_SCORE_VERSION;
}

export type PromotionEvaluation =
  | { result: 'QUALIFIES'; promotion: PromotionView }
  | { result: 'SUSPECT'; discountBps: number }
  | { result: 'NOT_PROMOTIONAL'; discountBps: number }
  | { result: 'INSUFFICIENT_DATA'; referencePoints: number }
  | { result: 'INVALID_PRICE'; reason: InvalidPriceReason };

function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function priceAgeMs(observedAt: string, now: Date): number {
  return now.getTime() - Date.parse(observedAt);
}

/** "2026-12" → "2026-11" / "2027-01". */
function shiftMonth(month: string, delta: number): string {
  const [year, monthIndex] = month.split('-').map(Number);
  const shifted = new Date(Date.UTC(year ?? 0, (monthIndex ?? 1) - 1 + delta, 1));
  return shifted.toISOString().slice(0, 7);
}

/** Mediana em unidade mínima; com quantidade par, média dos dois do meio para baixo. */
export function medianMinor(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error('medianMinor: empty list');
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] as number;
  }
  return Math.floor(((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2);
}

/** Mês da data, o anterior (se não for passado) e o seguinte. */
export function referenceMonths(departureDate: string, now: Date): string[] {
  const month = departureDate.slice(0, 7);
  const previous = shiftMonth(month, -1);
  const months = previous >= utcDate(now).slice(0, 7) ? [previous, month] : [month];
  return [...months, shiftMonth(month, 1)];
}

export function promotionScope(
  originCountryCode: string,
  destinationCountryCode: string,
): PromotionScope {
  return originCountryCode === destinationCountryCode ? 'DOMESTIC' : 'INTERNATIONAL';
}

/** Idade pela hora em que a fonte viu o preço (SPEC-032 §Frescor). */
export function promotionFreshness(observedAt: string, now: Date): PromotionFreshness {
  const age = priceAgeMs(observedAt, now);
  if (age > PROMOTION_MAX_PRICE_AGE_MS) return 'EXPIRED';
  return age > PROMOTION_RECENT_PRICE_AGE_MS ? 'AGING' : 'RECENT';
}

/** Motivo de o preço não valer (nem como candidato, nem como referência); null se vale. */
export function invalidPriceReason(
  price: PromotionPrice,
  currency: string,
  now: Date,
): InvalidPriceReason | null {
  if (!Number.isSafeInteger(price.amountMinor) || price.amountMinor <= 0) return 'NON_POSITIVE';
  if (price.currency !== currency) return 'CURRENCY';
  if (price.departureDate < utcDate(now)) return 'PAST_DATE';
  if (promotionFreshness(price.observedAt, now) === 'EXPIRED') return 'TOO_OLD';
  return null;
}

/** Linear de 0 a 100, saturando nas pontas, em inteiro. */
function linearComponent(value: number, floor: number, ceiling: number): number {
  if (ceiling <= floor) return value >= ceiling ? 100 : 0;
  if (value <= floor) return 0;
  if (value >= ceiling) return 100;
  return Math.floor(((value - floor) * 100) / (ceiling - floor));
}

/**
 * Score v1 (só para ordenar): desconto 50, economia 20, frescor 30.
 * Popularidade e percentil histórico não entram (não há dado).
 */
export function promotionScore(input: {
  discountBps: number;
  thresholdBps: number;
  absoluteSavingMinor: number;
  savingScoreCapMinor: number;
  observedAt: string;
  now: Date;
}): number {
  const discount = linearComponent(
    input.discountBps,
    input.thresholdBps,
    PROMOTION_DISCOUNT_SCORE_SATURATION_BPS,
  );
  const saving = linearComponent(input.absoluteSavingMinor, 0, input.savingScoreCapMinor);
  const age = Math.max(0, priceAgeMs(input.observedAt, input.now));
  const freshness = 100 - linearComponent(age, 0, PROMOTION_MAX_PRICE_AGE_MS);
  return Math.floor((50 * discount + 20 * saving + 30 * freshness) / 100);
}

export function evaluatePromotion(
  input: PromotionInput,
  policy: PromotionPolicy,
  now: Date,
): PromotionEvaluation {
  const { candidate, currency } = input;
  const invalid = invalidPriceReason(candidate, currency, now);
  if (invalid) {
    return { result: 'INVALID_PRICE', reason: invalid };
  }

  const points = input.referencePrices.filter(
    (price) =>
      price.departureDate !== candidate.departureDate &&
      invalidPriceReason(price, currency, now) === null,
  );
  if (points.length < policy.minReferencePoints) {
    return { result: 'INSUFFICIENT_DATA', referencePoints: points.length };
  }

  const referenceAmountMinor = medianMinor(points.map((price) => price.amountMinor));
  const absoluteSavingMinor = referenceAmountMinor - candidate.amountMinor;
  const discountBps = Math.floor((absoluteSavingMinor * BPS) / referenceAmountMinor);

  if (discountBps >= policy.suspectDiscountBps) {
    return { result: 'SUSPECT', discountBps };
  }
  const thresholdBps =
    input.scope === 'DOMESTIC' ? policy.minDomesticDiscountBps : policy.minInternationalDiscountBps;
  if (discountBps < thresholdBps) {
    return { result: 'NOT_PROMOTIONAL', discountBps };
  }

  return {
    result: 'QUALIFIES',
    promotion: {
      discountBps,
      absoluteSavingMinor,
      referenceAmountMinor,
      referencePointCount: points.length,
      referenceMonths: [...new Set(points.map((price) => price.departureDate.slice(0, 7)))].sort(),
      score: promotionScore({
        discountBps,
        thresholdBps,
        absoluteSavingMinor,
        savingScoreCapMinor: policy.savingScoreCapMinor,
        observedAt: candidate.observedAt,
        now,
      }),
      scoreVersion: PROMOTION_SCORE_VERSION,
    },
  };
}
