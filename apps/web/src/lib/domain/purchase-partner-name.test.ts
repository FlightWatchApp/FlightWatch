import { describe, expect, it } from 'vitest';
import { allFlightsLabel, purchasePartnerName } from './purchase-partner-name';

describe('purchasePartnerName (SPEC-045)', () => {
  it('reconhece a Decolar e a Aviasales pelo endereço', () => {
    expect(
      purchasePartnerName(
        'https://www.decolar.com/shop/flights/results/oneway/SAO/RIO/2026-11-14/1/0/0',
      ),
    ).toBe('Decolar');
    expect(purchasePartnerName('https://www.aviasales.com/search/SAO1411RIO1')).toBe('Aviasales');
  });

  it('endereço desconhecido, inválido ou parecido: null', () => {
    expect(purchasePartnerName('https://booking.simulated-provider.flightwatch.dev/x')).toBeNull();
    expect(purchasePartnerName('https://www.decolar.com.evil.example/x')).toBeNull();
    expect(purchasePartnerName('https://evil.example/?u=www.decolar.com')).toBeNull();
    expect(purchasePartnerName('não é url')).toBeNull();
  });
});

describe('allFlightsLabel (SPEC-045)', () => {
  it('nomeia o parceiro, ou cai no texto genérico', () => {
    expect(
      allFlightsLabel(
        'https://www.decolar.com/shop/flights/results/oneway/SAO/RIO/2026-11-14/1/0/0',
      ),
    ).toBe('Ver todos os voos na Decolar');
    expect(allFlightsLabel('https://booking.simulated-provider.flightwatch.dev/x')).toBe(
      'Ver todos os voos no site parceiro',
    );
  });
});
