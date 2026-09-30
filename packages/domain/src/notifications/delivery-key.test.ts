import { describe, expect, it } from 'vitest';
import { computeDeliveryKey } from './delivery-key.js';

describe('computeDeliveryKey', () => {
  const base = {
    alertEventId: 'alert-1',
    channel: 'EMAIL',
    destinationVersion: 0,
    templateVersion: 1,
  };

  it('is deterministic for the same inputs', () => {
    expect(computeDeliveryKey(base)).toBe(computeDeliveryKey(base));
  });

  // Troca de destino (novo e-mail) não reaproveita uma entrega antiga calada.
  it('differs when the destination version changes', () => {
    const a = computeDeliveryKey(base);
    const b = computeDeliveryKey({ ...base, destinationVersion: 1 });
    expect(a).not.toBe(b);
  });

  it('differs when the template version changes', () => {
    const a = computeDeliveryKey(base);
    const b = computeDeliveryKey({ ...base, templateVersion: 2 });
    expect(a).not.toBe(b);
  });

  it('differs when the channel differs', () => {
    const a = computeDeliveryKey(base);
    const b = computeDeliveryKey({ ...base, channel: 'SMS' });
    expect(a).not.toBe(b);
  });
});
