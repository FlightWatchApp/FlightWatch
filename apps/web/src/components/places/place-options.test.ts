import { describe, expect, it } from 'vitest';
import {
  formatPlaceLabel,
  moveActiveIndex,
  placeOptionDetail,
  textForValueChange,
} from './place-options';

describe('moveActiveIndex (SPEC-029 AC-9)', () => {
  it('desce e sobe dentro da lista', () => {
    expect(moveActiveIndex(-1, 1, 3)).toBe(0);
    expect(moveActiveIndex(0, 1, 3)).toBe(1);
    expect(moveActiveIndex(2, -1, 3)).toBe(1);
  });

  it('dá a volta nas pontas', () => {
    expect(moveActiveIndex(2, 1, 3)).toBe(0);
    expect(moveActiveIndex(0, -1, 3)).toBe(2);
    expect(moveActiveIndex(-1, -1, 3)).toBe(2);
  });

  it('lista vazia não tem item ativo', () => {
    expect(moveActiveIndex(0, 1, 0)).toBe(-1);
  });
});

describe('rótulos de cidade', () => {
  const saoPaulo = {
    code: 'SAO',
    name: 'São Paulo',
    countryCode: 'BR',
    countryName: 'Brasil',
    airports: [
      { code: 'GRU', name: 'Guarulhos' },
      { code: 'CGH', name: 'Congonhas' },
    ],
  };

  it('campo mostra nome e código da cidade', () => {
    expect(formatPlaceLabel(saoPaulo)).toBe('São Paulo (SAO)');
  });

  it('opção mostra país e aeroportos', () => {
    expect(placeOptionDetail(saoPaulo)).toBe('Brasil · GRU, CGH');
  });

  it('cidade com muitos aeroportos resume a lista', () => {
    const many = {
      ...saoPaulo,
      airports: ['GRU', 'CGH', 'VCP', 'RTE', 'XXX'].map((code) => ({ code, name: code })),
    };
    expect(placeOptionDetail(many)).toBe('Brasil · GRU, CGH, VCP +2');
  });
});

describe('textForValueChange (regressão do combobox)', () => {
  const sao = { code: 'SAO', name: 'São Paulo' };
  const lis = { code: 'LIS', name: 'Lisboa' };

  it('escolha nova mostra o rótulo dela', () => {
    expect(textForValueChange(null, sao, 'sao p')).toBe('São Paulo (SAO)');
    expect(textForValueChange(sao, lis, 'São Paulo (SAO)')).toBe('Lisboa (LIS)');
  });

  it('limpeza por digitação mantém o texto digitado', () => {
    expect(textForValueChange(sao, null, 'São Paulo (SAO)x')).toBeNull();
    expect(textForValueChange(sao, null, 'lis')).toBeNull();
  });

  it('limpeza vinda de fora (inverter rota) apaga o texto', () => {
    expect(textForValueChange(sao, null, 'São Paulo (SAO)')).toBe('');
  });
});
