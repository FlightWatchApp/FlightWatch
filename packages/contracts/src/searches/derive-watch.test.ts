import { describe, expect, it } from 'vitest';
import { deriveWatchFromOfferRequestSchema } from './derive-watch.js';

const validPayload = {
  alertRules: [{ type: 'TARGET_PRICE' as const, amountMinor: 80000, cooldownSeconds: 43200 }],
  notificationChannelId: '11111111-1111-1111-1111-111111111111',
};

describe('deriveWatchFromOfferRequestSchema', () => {
  it('accepts a single alert rule', () => {
    expect(deriveWatchFromOfferRequestSchema.safeParse(validPayload).success).toBe(true);
  });

  it('rejects unknown fields', () => {
    const result = deriveWatchFromOfferRequestSchema.safeParse({ ...validPayload, extra: 'nope' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty alertRules array', () => {
    const result = deriveWatchFromOfferRequestSchema.safeParse({
      ...validPayload,
      alertRules: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate alert rule types (shared with createWatchRequestSchema)', () => {
    const result = deriveWatchFromOfferRequestSchema.safeParse({
      ...validPayload,
      alertRules: [
        { type: 'TARGET_PRICE', amountMinor: 80000, cooldownSeconds: 43200 },
        { type: 'TARGET_PRICE', amountMinor: 70000, cooldownSeconds: 43200 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed notificationChannelId', () => {
    const result = deriveWatchFromOfferRequestSchema.safeParse({
      ...validPayload,
      notificationChannelId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});
