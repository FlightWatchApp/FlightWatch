import { describe, expect, it } from 'vitest';
import { deriveWatchFromOfferRequestSchema } from './derive-watch.js';

const validPayload = {
  notificationChannelId: '11111111-1111-1111-1111-111111111111',
};

describe('deriveWatchFromOfferRequestSchema', () => {
  it('accepts just the notification channel', () => {
    expect(deriveWatchFromOfferRequestSchema.safeParse(validPayload).success).toBe(true);
  });

  it('rejects unknown fields', () => {
    const result = deriveWatchFromOfferRequestSchema.safeParse({ ...validPayload, extra: 'nope' });
    expect(result.success).toBe(false);
  });

  // SPEC-039: o cliente não escolhe regras — a API cria a de preço baixo.
  it('rejects alertRules sent by the client', () => {
    const result = deriveWatchFromOfferRequestSchema.safeParse({
      ...validPayload,
      alertRules: [{ type: 'TARGET_PRICE', amountMinor: 100, cooldownSeconds: 43200 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed notificationChannelId', () => {
    const result = deriveWatchFromOfferRequestSchema.safeParse({
      notificationChannelId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});
