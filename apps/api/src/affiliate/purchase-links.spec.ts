import { PURCHASE_PARTNER_VALUES } from '@flight-watch/config';
import { PURCHASE_PARTNERS, type PurchaseTrip } from '@flight-watch/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetAffiliateConfigCache } from './affiliate-links.js';
import { resolvePartnerLink } from './purchase-links.js';

const TRIP: PurchaseTrip = {
  originCode: 'SAO',
  destinationCode: 'RIO',
  tripType: 'ONE_WAY',
  departureDate: '2026-11-14',
  returnDate: null,
  adults: 1,
};
const DECOLAR_URL =
  'https://www.decolar.com/shop/flights/results/oneway/SAO/RIO/2026-11-14/1/0/0?from=SB&di=1';
const AVIASALES_URL = 'https://www.aviasales.com/search/SAO1411RIO1';

describe('resolvePartnerLink (SPEC-044)', () => {
  const originalAffiliate = process.env.AFFILIATE_TRACKING_PARAMS;

  beforeEach(() => {
    delete process.env.AFFILIATE_TRACKING_PARAMS;
    resetAffiliateConfigCache();
  });

  afterEach(() => {
    if (originalAffiliate === undefined) delete process.env.AFFILIATE_TRACKING_PARAMS;
    else process.env.AFFILIATE_TRACKING_PARAMS = originalAffiliate;
    resetAffiliateConfigCache();
  });

  const link = (overrides: Partial<Parameters<typeof resolvePartnerLink>[0]> = {}) =>
    resolvePartnerLink({
      partner: 'decolar',
      trip: TRIP,
      providerStrategy: 'TRAVELPAYOUTS',
      providerUrl: AVIASALES_URL,
      surface: 'WATCH',
      ...overrides,
    });

  describe('parceiro decolar', () => {
    it('monta a busca da Decolar pela viagem e ignora o link da fonte', () => {
      expect(link()).toBe(DECOLAR_URL);
    });

    it('funciona sem nenhum link da fonte (nada gravado no banco)', () => {
      expect(link({ providerUrl: null })).toBe(DECOLAR_URL);
      expect(link({ providerUrl: undefined })).toBe(DECOLAR_URL);
    });

    it('não acrescenta marker da Travelpayouts nem utm à Decolar', () => {
      process.env.AFFILIATE_TRACKING_PARAMS = '{"TRAVELPAYOUTS":{"marker":"123456"}}';
      resetAffiliateConfigCache();
      expect(link()).toBe(DECOLAR_URL);
    });

    it('com afiliado configurado para DECOLAR, acrescenta só os parâmetros dele', () => {
      process.env.AFFILIATE_TRACKING_PARAMS = '{"DECOLAR":{"afid":"abc"}}';
      resetAffiliateConfigCache();
      const url = new URL(link({ surface: 'ROUTE' }) as string);
      expect(url.host).toBe('www.decolar.com');
      expect(url.searchParams.get('afid')).toBe('abc');
      expect(url.searchParams.get('utm_campaign')).toBe('route');
      expect(url.searchParams.get('di')).toBe('1'); // a busca continua intacta
    });

    it('viagem inválida vira "sem link", não link quebrado', () => {
      expect(link({ trip: { ...TRIP, originCode: 'sao' } })).toBeNull();
      expect(link({ trip: { ...TRIP, tripType: 'ROUND_TRIP' } })).toBeNull();
    });
  });

  describe('parceiro provider (comportamento de antes)', () => {
    it('usa o link da fonte pela allowlist da fonte', () => {
      expect(link({ partner: 'provider' })).toBe(AVIASALES_URL);
    });

    it('com o marker da Travelpayouts configurado, ele continua sendo aplicado', () => {
      process.env.AFFILIATE_TRACKING_PARAMS = '{"TRAVELPAYOUTS":{"marker":"123456"}}';
      resetAffiliateConfigCache();
      const url = new URL(link({ partner: 'provider' }) as string);
      expect(url.host).toBe('www.aviasales.com');
      expect(url.searchParams.get('marker')).toBe('123456');
    });

    it('sem link da fonte, ou com host fora da allowlist, não há link', () => {
      expect(link({ partner: 'provider', providerUrl: null })).toBeNull();
      expect(link({ partner: 'provider', providerUrl: DECOLAR_URL })).toBeNull();
    });
  });

  it('a lista de parceiros da configuração é a mesma do domínio', () => {
    expect([...PURCHASE_PARTNER_VALUES]).toEqual([...PURCHASE_PARTNERS]);
  });
});
