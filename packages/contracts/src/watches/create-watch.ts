import { z } from 'zod';
import { applyTripInvariants } from '../shared/trip-validation.js';
import {
  currencyCodeSchema,
  iataCodeSchema,
  isoDateSchema,
  marketCodeSchema,
} from '../shared/trip-fields.js';

/**
 * Limites de cooldown ainda não definidos pelo produto (SPEC-001 §5 diz apenas
 * "dentro dos limites do produto"). Placeholder: 1h a 30 dias — ajustar quando
 * o produto decidir.
 */
const COOLDOWN_SECONDS_MIN = 3600;
const COOLDOWN_SECONDS_MAX = 2_592_000;

const cooldownSecondsSchema = z.number().int().min(COOLDOWN_SECONDS_MIN).max(COOLDOWN_SECONDS_MAX);

const targetPriceRuleSchema = z
  .object({
    type: z.literal('TARGET_PRICE'),
    amountMinor: z.number().int().positive(),
    cooldownSeconds: cooldownSecondsSchema,
  })
  .strict();

const percentageDropRuleSchema = z
  .object({
    type: z.literal('PERCENTAGE_DROP'),
    percent: z.number().gt(0).lte(100),
    cooldownSeconds: cooldownSecondsSchema,
  })
  .strict();

const absoluteDropRuleSchema = z
  .object({
    type: z.literal('ABSOLUTE_DROP'),
    dropAmountMinor: z.number().int().positive(),
    cooldownSeconds: cooldownSecondsSchema,
  })
  .strict();

const newObservedLowRuleSchema = z
  .object({
    type: z.literal('NEW_OBSERVED_LOW'),
    cooldownSeconds: cooldownSecondsSchema,
  })
  .strict();

export const alertRuleInputSchema = z.discriminatedUnion('type', [
  targetPriceRuleSchema,
  percentageDropRuleSchema,
  absoluteDropRuleSchema,
  newObservedLowRuleSchema,
]);

export type AlertRuleInput = z.infer<typeof alertRuleInputSchema>;

/**
 * Reusada por SPEC-014's `deriveWatchFromOfferRequestSchema` — mesma regra,
 * mesmo ponto único de verdade, para não divergir entre os dois pontos de
 * entrada que aceitam `alertRules` do cliente.
 */
export function assertUniqueAlertRuleTypes(
  alertRules: AlertRuleInput[],
  ctx: z.RefinementCtx,
): void {
  const ruleTypes = alertRules.map((rule) => rule.type);
  if (new Set(ruleTypes).size !== ruleTypes.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'alertRules must not contain duplicate types',
      path: ['alertRules'],
    });
  }
}

export const createWatchRequestSchema = z
  .object({
    origin: iataCodeSchema,
    destination: iataCodeSchema,
    tripType: z.enum(['ONE_WAY', 'ROUND_TRIP']),
    departureDate: isoDateSchema,
    returnDate: isoDateSchema.nullable(),
    cabin: z.literal('ECONOMY'),
    adults: z.literal(1),
    currency: currencyCodeSchema,
    market: marketCodeSchema,
    alertRules: z.array(alertRuleInputSchema).min(1).max(4),
    notificationChannelId: z.string().uuid(),
  })
  .strict()
  .superRefine((data, ctx) => {
    applyTripInvariants(data, ctx);
    assertUniqueAlertRuleTypes(data.alertRules, ctx);
  });

export type CreateWatchRequest = z.infer<typeof createWatchRequestSchema>;

const watchStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'EXPIRED', 'CANCELLED']);

export const createWatchResponseSchema = z.object({
  id: z.string().uuid(),
  status: watchStatusSchema,
  search: z.object({
    origin: z.string(),
    destination: z.string(),
    // SPEC-029: nome da cidade no catálogo; null quando o código não tem cadastro.
    originName: z.string().nullable(),
    destinationName: z.string().nullable(),
    departureDate: z.string(),
    returnDate: z.string().nullable(),
    tripType: z.enum(['ONE_WAY', 'ROUND_TRIP']),
    cabin: z.literal('ECONOMY'),
    adults: z.literal(1),
    currency: z.string(),
  }),
  alertRules: z.array(z.unknown()),
  lastObservation: z.null(),
  createdAt: z.string(),
});

export type CreateWatchResponse = z.infer<typeof createWatchResponseSchema>;
