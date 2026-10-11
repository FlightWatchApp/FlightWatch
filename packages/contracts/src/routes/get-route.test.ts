import { describe, expect, it } from 'vitest';
import { getRouteParamsSchema, getRouteQuerySchema } from './get-route.js';

describe('getRoute schemas (SPEC-033 §API)', () => {
  it('códigos em maiúsculas; tipo de viagem padrão só ida', () => {
    expect(getRouteParamsSchema.parse({ origin: 'gru', destination: 'dou' })).toEqual({
      origin: 'GRU',
      destination: 'DOU',
    });
    expect(getRouteQuerySchema.parse({})).toEqual({ tripType: 'ONE_WAY' });
  });

  it('recusa código que não é IATA e campo desconhecido', () => {
    expect(getRouteParamsSchema.safeParse({ origin: 'SAOP', destination: 'DOU' }).success).toBe(
      false,
    );
    expect(getRouteQuerySchema.safeParse({ tripType: 'MULTI' }).success).toBe(false);
    expect(getRouteQuerySchema.safeParse({ currency: 'USD' }).success).toBe(false);
  });
});
