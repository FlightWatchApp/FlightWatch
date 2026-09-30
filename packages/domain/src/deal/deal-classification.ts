import { type Money, isLessThanOrEqual } from '../money/money.js';
import { evaluatePercentageDropRule } from '../alert-rule/alert-rule.js';

export type DealType = 'HISTORICAL_LOW' | 'PERCENTAGE_BELOW_REFERENCE';
export type DealConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

// SPEC-015: número mínimo de observações pra uma comparação fazer sentido —
// com 1 observação só, "média histórica"/"menor já visto" são a própria
// observação atual, o que tornaria qualquer preço um "deal" trivialmente.
export const MIN_OBSERVATIONS_FOR_REFERENCE = 2;

// SPEC-015: limiar placeholder, produto ainda não decidiu o valor final —
// mesmo tratamento de COOLDOWN_SECONDS_MIN/MAX (packages/contracts) e
// MAX_ACTIVE_WATCHES_PER_USER (apps/api/src/watches/watches.service.ts).
export const MIN_PERCENTAGE_BELOW_REFERENCE = 10;

export interface DealClassificationInput {
  currentAmount: Money;
  lowestEverAmount: Money;
  averageAmount: Money;
  observationCount: number;
}

export interface DealClassification {
  dealType: DealType | null;
  referenceAmount: Money | null;
  dropPercent: number | null;
  confidence: DealConfidence;
}

function classifyConfidence(observationCount: number): DealConfidence {
  if (observationCount < 5) return 'LOW';
  if (observationCount < 20) return 'MEDIUM';
  return 'HIGH';
}

/**
 * SPEC-015 §"Comportamento de domínio": classificação é sempre computada em
 * leitura, nunca persistida — mesmo princípio de `Watch.currentOffer`/
 * `currentPrice`/`lowestPrice` (packages/database/src/watch-listing-repository.ts).
 * `null` (sem dealType) é o resultado normal pra maioria dos SearchTargets —
 * não é um erro, é "isto não é uma oportunidade agora".
 *
 * HISTORICAL_LOW é checado antes de PERCENTAGE_BELOW_REFERENCE: um preço que
 * é o menor já visto também costuma estar abaixo da média, e a classificação
 * mais forte ("nunca esteve mais barato") é mais informativa que "está X%
 * abaixo da média" — nunca reportar as duas ao mesmo tempo.
 */
export function classifyDeal(input: DealClassificationInput): DealClassification {
  const confidence = classifyConfidence(input.observationCount);

  if (input.observationCount < MIN_OBSERVATIONS_FOR_REFERENCE) {
    return { dealType: null, referenceAmount: null, dropPercent: null, confidence };
  }

  if (isLessThanOrEqual(input.currentAmount, input.lowestEverAmount)) {
    return {
      dealType: 'HISTORICAL_LOW',
      referenceAmount: input.lowestEverAmount,
      dropPercent: null,
      confidence,
    };
  }

  const { triggered, dropPercent } = evaluatePercentageDropRule({
    currentAmount: input.currentAmount,
    referenceAmount: input.averageAmount,
    configuredPercent: MIN_PERCENTAGE_BELOW_REFERENCE,
  });
  if (triggered) {
    return {
      dealType: 'PERCENTAGE_BELOW_REFERENCE',
      referenceAmount: input.averageAmount,
      dropPercent,
      confidence,
    };
  }

  return { dealType: null, referenceAmount: null, dropPercent: null, confidence };
}
