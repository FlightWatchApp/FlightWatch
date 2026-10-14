import { describe, expect, it } from 'vitest';
import { lowPriceDetails } from './process-job.js';

// SPEC-039: justificativa do AlertEvent vem do banco como JSON — validada na leitura.
describe('lowPriceDetails', () => {
  it('lê os motivos e o preço normal', () => {
    expect(
      lowPriceDetails({
        reasons: ['BELOW_TYPICAL', 'LOWEST_OBSERVED'],
        typicalAmountMinor: 45_000,
      }),
    ).toEqual({ belowTypical: true, lowestObserved: true, typicalAmountMinor: 45_000 });
  });

  it('dado inesperado vira ausência de detalhe, nunca erro', () => {
    expect(lowPriceDetails(null)).toBeNull();
    expect(lowPriceDetails({ reasons: 'BELOW_TYPICAL' })).toBeNull();
    expect(lowPriceDetails({ reasons: [], typicalAmountMinor: 1.5 })).toEqual({
      belowTypical: false,
      lowestObserved: false,
      typicalAmountMinor: null,
    });
  });
});
