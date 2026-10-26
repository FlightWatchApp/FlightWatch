import { describe, expect, it } from 'vitest';
import { buildGroupMessage, type GroupMessageInput } from './group-message';

const NOW = new Date('2026-10-26T15:00:00Z');

const BASE: GroupMessageInput = {
  originName: 'São Paulo',
  destinationName: 'Rio de Janeiro',
  tripType: 'ONE_WAY',
  departureDate: '2026-11-20',
  returnDate: null,
  price: { amountMinor: 32_000, currency: 'BRL' },
  discountBps: 3400,
  referenceMedianMinor: 48_400,
  referencePointCount: 23,
  stops: 0,
  observedAt: '2026-10-26T12:00:00Z',
  purchaseUrl:
    'https://www.decolar.com/shop/flights/results/oneway/SAO/RIO/2026-11-20/1/0/0?from=SB&di=1',
};

describe('buildGroupMessage (SPEC-045 parte B)', () => {
  it('monta a mensagem de só ida com rota, data, preço, contexto, idade, link e aviso', () => {
    const text = buildGroupMessage(BASE, NOW);
    expect(text).toContain('*São Paulo → Rio de Janeiro*');
    expect(text).toContain('Só ida · 20/11/2026');
    expect(text).toContain('Direto');
    expect(text).toContain('*R$ 320,00*');
    expect(text).toContain('34% abaixo da mediana dos 23 preços que observamos');
    expect(text).toContain('Visto há 3 h');
    expect(text).toContain(BASE.purchaseUrl as string);
    expect(text).toMatch(/confirme o valor/i);
  });

  it('ida e volta mostra as duas datas e as escalas', () => {
    const text = buildGroupMessage(
      { ...BASE, tripType: 'ROUND_TRIP', returnDate: '2026-11-27', stops: 2 },
      NOW,
    );
    expect(text).toContain('Ida e volta · 20/11/2026 → 27/11/2026');
    expect(text).toContain('2 escalas');
  });

  it('sem link, a mensagem sai sem a linha do link (nunca um link inventado)', () => {
    const text = buildGroupMessage({ ...BASE, purchaseUrl: null }, NOW);
    expect(text).not.toContain('http');
    expect(text).not.toContain('🔗');
  });

  it('preço velho avisa a idade em dias e que é referência', () => {
    const text = buildGroupMessage({ ...BASE, observedAt: '2026-10-23T12:00:00Z' }, NOW);
    expect(text).toContain('Visto há 3 dias');
  });

  it('nunca usa as frases proibidas do site', () => {
    const text = buildGroupMessage(BASE, NOW).toLowerCase();
    for (const banned of [
      'menor preço do mercado',
      'garantid',
      'tempo real',
      'melhor momento',
      'desconto',
      'preço-alvo',
    ]) {
      expect(text).not.toContain(banned);
    }
  });

  it('sem desconto positivo, não afirma que está abaixo do normal', () => {
    const text = buildGroupMessage({ ...BASE, discountBps: 0 }, NOW);
    expect(text).not.toContain('abaixo da mediana');
  });
});
