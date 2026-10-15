import { z } from 'zod';
import { iataCodeSchema, isoDateSchema } from '../shared/trip-fields.js';

/**
 * SPEC-039 §"Tela de criação": o que o sistema sabe da viagem antes de criar o
 * Watch — preço normal, menor já observado, preço de hoje e os preços das
 * datas próximas para o gráfico. Não cria nada.
 */
export const watchPreviewQuerySchema = z
  .object({
    origin: iataCodeSchema,
    destination: iataCodeSchema,
    tripType: z.enum(['ONE_WAY', 'ROUND_TRIP']),
    departureDate: isoDateSchema,
    returnDate: isoDateSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasReturn = data.returnDate !== undefined;
    if ((data.tripType === 'ROUND_TRIP') !== hasReturn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'returnDate is required for ROUND_TRIP and forbidden for ONE_WAY',
        path: ['returnDate'],
      });
    }
    if (data.returnDate !== undefined && data.returnDate <= data.departureDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'returnDate must be after departureDate',
        path: ['returnDate'],
      });
    }
  });

export type WatchPreviewQuery = z.infer<typeof watchPreviewQuerySchema>;

export const watchPreviewResponseSchema = z.object({
  currency: z.string(),
  dropPercent: z.number().int(),
  typicalAmountMinor: z.number().int().nullable(),
  typicalSource: z.enum(['HISTORY', 'NEARBY_DATES']).nullable(),
  lowestAmountMinor: z.number().int().nullable(),
  /** Último preço da própria data (observação do sistema ou calendário da fonte). */
  currentAmountMinor: z.number().int().nullable(),
  /** Menor preço por data nas datas próximas (gráfico), em ordem de data. */
  days: z.array(z.object({ date: z.string(), amountMinor: z.number().int() })),
});

export type WatchPreviewResponse = z.infer<typeof watchPreviewResponseSchema>;
