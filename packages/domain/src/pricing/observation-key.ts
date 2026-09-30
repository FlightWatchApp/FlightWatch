import { createHash } from 'node:crypto';

// Bucket de 1min: reprocessar o mesmo resultado minutos depois de um retry ou
// redelivery de job ainda cai na mesma chave, sem depender de milissegundos.
const OBSERVED_AT_BUCKET_MINUTES = 1;

export function computeObservedAtBucket(
  observedAt: Date,
  bucketMinutes = OBSERVED_AT_BUCKET_MINUTES,
): Date {
  const bucketMs = bucketMinutes * 60_000;
  return new Date(Math.floor(observedAt.getTime() / bucketMs) * bucketMs);
}

export interface ObservationKeyInput {
  searchExecutionId: string;
  offerSignature: string;
  observedAtBucket: Date;
  normalizerVersion: number;
}

// SPEC-004 §4: SHA-256(search_execution_id|selected_offer_signature|observed_at_bucket|normalizer_version).
export function computeObservationKey(input: ObservationKeyInput): string {
  const raw = `${input.searchExecutionId}|${input.offerSignature}|${input.observedAtBucket.toISOString()}|${input.normalizerVersion}`;
  return createHash('sha256').update(raw).digest('hex');
}
