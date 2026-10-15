import { describe, expect, it } from 'vitest';
import { updateMeRequestSchema } from './overview.js';

describe('updateMeRequestSchema (SPEC-040)', () => {
  it('aceita código de cidade (normalizado) e null; recusa o resto', () => {
    expect(updateMeRequestSchema.parse({ homeCityCode: 'sao' })).toEqual({ homeCityCode: 'SAO' });
    expect(updateMeRequestSchema.parse({ homeCityCode: null })).toEqual({ homeCityCode: null });
    expect(updateMeRequestSchema.safeParse({ homeCityCode: 'SAOPAULO' }).success).toBe(false);
    expect(updateMeRequestSchema.safeParse({ homeCityCode: 'SAO', email: 'x' }).success).toBe(
      false,
    );
  });
});
