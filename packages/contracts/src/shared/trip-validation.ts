import { z } from 'zod';

export interface TripInvariantInput {
  origin: string;
  destination: string;
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  departureDate: string;
  returnDate: string | null;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * SPEC-001 §6 + SPEC-014: mesmas invariantes de viagem usadas tanto na
 * criação direta de um Watch quanto na criação de uma busca de descoberta —
 * extraídas para não divergir entre os dois pontos de entrada. "Derivar Watch
 * de uma oferta" (SPEC-014) monta o CreateWatchRequest direto no código, sem
 * passar pelo pipe de validação de Watch de novo, então a busca de origem
 * precisa aplicar exatamente as mesmas regras — se divergissem, uma busca
 * poderia aceitar uma combinação que a criação de Watch rejeitaria.
 */
export function applyTripInvariants(data: TripInvariantInput, ctx: z.RefinementCtx): void {
  if (data.origin === data.destination) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'origin and destination must differ',
      path: ['destination'],
    });
  }

  if (data.tripType === 'ONE_WAY' && data.returnDate !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'ONE_WAY trips must not have a returnDate',
      path: ['returnDate'],
    });
  }

  if (data.tripType === 'ROUND_TRIP') {
    if (data.returnDate === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ROUND_TRIP trips require a returnDate',
        path: ['returnDate'],
      });
    } else if (data.returnDate <= data.departureDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'returnDate must be after departureDate',
        path: ['returnDate'],
      });
    }
  }

  // "dentro da janela do provedor" (SPEC-001 §5) depende do provedor escolhido
  // (ADR-004, ainda pendente) e não é validado aqui — só a data futura.
  if (data.departureDate <= todayIsoDate()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'departureDate must be in the future',
      path: ['departureDate'],
    });
  }
}
