import { describe, expect, it } from 'vitest';
import { parseRouteSegment, routePath, routeSegment, slugify } from './route-url';

const SAO = { code: 'SAO', name: 'São Paulo' };
const DOU = { code: 'DOU', name: 'Dourados' };
const BEL = { code: 'BEL', name: 'Belém do Pará' };

describe('slugify', () => {
  it('sem acento, minúsculas e hífen', () => {
    expect(slugify('São Paulo')).toBe('sao-paulo');
    expect(slugify('Belém do Pará')).toBe('belem-do-para');
    expect(slugify('  Foz do Iguaçu (PR) ')).toBe('foz-do-iguacu-pr');
    expect(slugify("Sant'Ana")).toBe('sant-ana');
  });
});

describe('routeSegment / routePath (SPEC-033 §URL)', () => {
  it('cidade-código-para-cidade-código', () => {
    expect(routeSegment(SAO, DOU)).toBe('sao-paulo-sao-para-dourados-dou');
    expect(routePath(SAO, DOU)).toBe('/voos/sao-paulo-sao-para-dourados-dou');
  });
});

describe('parseRouteSegment', () => {
  it('lê o formato canônico', () => {
    expect(parseRouteSegment('sao-paulo-sao-para-dourados-dou')).toEqual({
      originCode: 'SAO',
      destinationCode: 'DOU',
      originSlug: 'sao-paulo',
      destinationSlug: 'dourados',
    });
  });

  it('nome com "para" no meio não confunde a leitura (Belém do Pará)', () => {
    expect(parseRouteSegment(routeSegment(BEL, SAO))).toMatchObject({
      originCode: 'BEL',
      destinationCode: 'SAO',
      originSlug: 'belem-do-para',
    });
    expect(parseRouteSegment(routeSegment(SAO, BEL))).toMatchObject({
      originCode: 'SAO',
      destinationCode: 'BEL',
      destinationSlug: 'belem-do-para',
    });
  });

  it('aceita só os códigos (vira redirecionamento para a canônica)', () => {
    expect(parseRouteSegment('gru-para-dou')).toEqual({
      originCode: 'GRU',
      destinationCode: 'DOU',
      originSlug: null,
      destinationSlug: null,
    });
  });

  it('aceita maiúsculas e devolve código em maiúsculas', () => {
    expect(parseRouteSegment('GRU-para-DOU')?.originCode).toBe('GRU');
  });

  it('formato inválido devolve null', () => {
    expect(parseRouteSegment('sao-paulo')).toBeNull();
    expect(parseRouteSegment('sao-para')).toBeNull();
    expect(parseRouteSegment('saopaulo-para-dourados')).toBeNull();
    expect(parseRouteSegment('')).toBeNull();
  });

  it('ida e volta são o inverso uma da outra', () => {
    const back = parseRouteSegment(routeSegment(DOU, SAO));
    expect(back?.originCode).toBe('DOU');
    expect(back?.destinationCode).toBe('SAO');
  });
});
