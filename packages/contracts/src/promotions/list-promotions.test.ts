import { describe, expect, it } from 'vitest';
import { listPromotionsQuerySchema } from './list-promotions.js';

describe('listPromotionsQuerySchema (SPEC-032 §Contrato)', () => {
  it('só a origem é obrigatória; o resto tem padrão', () => {
    expect(listPromotionsQuerySchema.parse({ origin: 'cgr' })).toEqual({
      origin: 'CGR',
      tripType: 'ONE_WAY',
      scope: 'all',
      sort: 'score',
      limit: 20,
    });
  });

  it('limit vem da query string e vai até 50', () => {
    expect(listPromotionsQuerySchema.parse({ origin: 'SAO', limit: '50' }).limit).toBe(50);
    expect(listPromotionsQuerySchema.safeParse({ origin: 'SAO', limit: '51' }).success).toBe(false);
    expect(listPromotionsQuerySchema.safeParse({ origin: 'SAO', limit: '0' }).success).toBe(false);
  });

  it('recusa origem ausente, valores fora da lista e campos desconhecidos', () => {
    expect(listPromotionsQuerySchema.safeParse({}).success).toBe(false);
    expect(listPromotionsQuerySchema.safeParse({ origin: 'SAO', sort: 'random' }).success).toBe(
      false,
    );
    expect(listPromotionsQuerySchema.safeParse({ origin: 'SAO', scope: 'BR' }).success).toBe(false);
    expect(listPromotionsQuerySchema.safeParse({ origin: 'SAO', currency: 'USD' }).success).toBe(
      false,
    );
  });
});
