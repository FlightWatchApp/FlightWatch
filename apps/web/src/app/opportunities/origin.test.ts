import { describe, expect, it } from 'vitest';
import { normalizeOriginCode } from './origin';

describe('normalizeOriginCode (SPEC-032 AC-9)', () => {
  it('aceita código de 3 letras, em qualquer caixa', () => {
    expect(normalizeOriginCode(' cgr ')).toBe('CGR');
  });

  it('recusa vazio, tamanho errado ou caracteres fora de A-Z', () => {
    for (const value of [undefined, null, '', 'SA', 'SAOP', 'S4O', 'SÃO']) {
      expect(normalizeOriginCode(value)).toBeNull();
    }
  });
});
