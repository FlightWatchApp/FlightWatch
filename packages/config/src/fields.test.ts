import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { iataListField } from './fields.js';

const schema = z.object({ CITIES: iataListField() });

describe('iataListField (SPEC-033 sitemap)', () => {
  it('ausente ou vazio vira lista vazia', () => {
    expect(schema.parse({}).CITIES).toEqual([]);
    expect(schema.parse({ CITIES: '  ' }).CITIES).toEqual([]);
  });

  it('maiúsculas, sem espaço e sem repetição', () => {
    expect(schema.parse({ CITIES: 'sao, RIO ,sao' }).CITIES).toEqual(['SAO', 'RIO']);
  });

  it('recusa código fora do formato sem ecoar o valor', () => {
    const result = schema.safeParse({ CITIES: 'SAO,SAOP' });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).not.toContain('SAOP');
  });
});
