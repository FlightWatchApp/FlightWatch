import { createHash } from 'node:crypto';

// SPEC-002 §5 passo 4: "calcular janela e chave idempotente por target + janela +
// estratégia". Bucket de 5min: protege contra duplo agendamento dentro de uma
// rajada curta (dois ticks do scheduler muito próximos, réplicas correndo junto),
// que é o risco real que AC-001 pede pra cobrir. Precisa ficar menor que qualquer
// checkIntervalSeconds plausível — janela maior colidiria com uma re-checagem
// legítima e válida, não só com uma corrida.
export const SCHEDULE_WINDOW_MINUTES = 5;

export function computeScheduleWindowStart(
  now: Date,
  windowMinutes = SCHEDULE_WINDOW_MINUTES,
): Date {
  const bucketMs = windowMinutes * 60_000;
  return new Date(Math.floor(now.getTime() / bucketMs) * bucketMs);
}

export interface SearchExecutionIdempotencyKeyInput {
  searchTargetId: string;
  windowStart: Date;
  providerStrategy: string;
}

export function computeSearchExecutionIdempotencyKey(
  input: SearchExecutionIdempotencyKeyInput,
): string {
  const raw = `${input.searchTargetId}|${input.windowStart.toISOString()}|${input.providerStrategy}`;
  return createHash('sha256').update(raw).digest('hex');
}
