import { z } from 'zod';

/**
 * SPEC-030: oferta vinda de cache de preços — o menor preço encontrado para a
 * rota e o dia, sem horário nem companhia. `segments` fica vazio nesse caso.
 */
export const fareSummaryViewSchema = z.object({
  departureDate: z.string(),
  returnDate: z.string().nullable(),
  stops: z.number().int(),
  durationMinutes: z.number().int().nullable(),
});

export type FareSummaryView = z.infer<typeof fareSummaryViewSchema>;
