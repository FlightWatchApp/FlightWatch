import { createHash } from 'node:crypto';
import type { FlightOffer } from '@flight-watch/domain';
import { ProviderError } from '../errors.js';
import type {
  CalendarDay,
  CheapestByDestinationQuery,
  DestinationFare,
  FlightProvider,
  FlightSearchQuery,
  PriceCalendarQuery,
  ProviderContext,
  ProviderSearchResult,
} from '../port.js';

export type SimulatedScenario = (
  query: FlightSearchQuery,
  context: ProviderContext,
) => ProviderSearchResult;

function deterministicPriceMinor(seed: string): number {
  const hash = createHash('sha256').update(seed).digest();
  const value = hash.readUInt32BE(0);
  return 40_000 + (value % 80_000);
}

// SPEC-018: host claramente simulado, nunca um domínio real de companhia/OTA
// — mesma allowlist que packages/domain/src/pricing/purchase-link.ts exige
// antes de expor qualquer deeplink numa resposta HTTP.
const SIMULATED_BOOKING_HOST = 'booking.simulated-provider.flightwatch.dev';
// SPEC-018: 1h é só um valor plausível pra ter dado real pra projetar e
// testar — não é uma política de produto aprovada (ver spec, "Questões em aberto").
const SIMULATED_OFFER_TTL_MS = 60 * 60 * 1000;

/** Cenário padrão: gera uma oferta plausível e determinística, sem rede nem aleatoriedade. */
export function defaultScenario(query: FlightSearchQuery): ProviderSearchResult {
  const seed = `${query.originIata}|${query.destinationIata}|${query.departureDate}`;
  const observedAt = new Date();
  const offer: FlightOffer = {
    providerOfferId: `sim-${seed}`,
    totalAmountMinor: deterministicPriceMinor(seed),
    currency: query.currency,
    passengerCount: query.adults,
    segments: [
      {
        originIata: query.originIata,
        destinationIata: query.destinationIata,
        departureAt: `${query.departureDate}T08:00:00Z`,
        arrivalAt: `${query.departureDate}T10:30:00Z`,
        carrier: 'SIM',
      },
    ],
    observedAt: observedAt.toISOString(),
    expiresAt: new Date(observedAt.getTime() + SIMULATED_OFFER_TTL_MS).toISOString(),
    deeplink: `https://${SIMULATED_BOOKING_HOST}/checkout/${encodeURIComponent(seed)}`,
  };
  return { kind: 'offers', offers: [offer] };
}

export function offersScenario(offers: FlightOffer[]): SimulatedScenario {
  return () => ({ kind: 'offers', offers });
}

export function noOffersScenario(): SimulatedScenario {
  return () => ({ kind: 'no_offers' });
}

/** Cenário que lança um ProviderError a cada chamada (para EVAL-PROVIDER-*). */
export function failingScenario(
  errorClass: ConstructorParameters<typeof ProviderError>[0],
  message: string,
  options?: { retryAfterMs?: number },
): SimulatedScenario {
  return () => {
    throw new ProviderError(errorClass, message, options);
  };
}

/** Encadeia cenários: o N-ésimo `search()` usa results[N], travando no último ao esgotar. */
export function sequenceScenario(results: SimulatedScenario[]): SimulatedScenario {
  if (results.length === 0) {
    throw new Error('sequenceScenario requires at least one scenario');
  }
  let index = 0;
  return (query, context) => {
    const scenario = results[Math.min(index, results.length - 1)];
    index += 1;
    if (!scenario) {
      throw new Error('unreachable: index is always within results bounds');
    }
    return scenario(query, context);
  };
}

/**
 * SPEC-032: destinos do simulado — cidades comuns do catálogo, nacionais e
 * internacionais. Nenhuma lista dessas existe fora do simulado (SPEC-029).
 */
const SIMULATED_DESTINATIONS = [
  'SAO',
  'RIO',
  'BSB',
  'SSA',
  'REC',
  'FOR',
  'POA',
  'CWB',
  'FLN',
  'MAO',
  'BEL',
  'NAT',
  'CGR',
  'DOU',
  'LIS',
  'MIA',
  'NYC',
  'MAD',
  'PAR',
  'BUE',
  'SCL',
  'LIM',
  'ORL',
  'LON',
] as const;
/** Janela de datas do simulado: de amanhã até 60 dias. */
const SIMULATED_WINDOW_DAYS = 60;
const SIMULATED_TRIP_LENGTH_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export class SimulatedFlightProvider implements FlightProvider {
  readonly strategy = 'SIMULATED';

  constructor(
    private readonly scenario: SimulatedScenario = defaultScenario,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // `async` aqui não é estilo: garante que um `throw` síncrono dentro do cenário
  // (ex.: failingScenario) sempre vire rejeição de Promise, nunca um throw direto
  // na chamada de search() — contrato que quem consome a porta pode confiar.
  async search(query: FlightSearchQuery, context: ProviderContext): Promise<ProviderSearchResult> {
    return this.scenario(query, context);
  }

  /**
   * SPEC-031: um preço por dia, com a mesma semente do cenário padrão — o
   * dia do calendário bate com a busca daquele dia.
   */
  async priceCalendar(query: PriceCalendarQuery): Promise<CalendarDay[]> {
    const [year, month] = query.month.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(year ?? 0, month ?? 1, 0)).getUTCDate();
    const observedAt = this.now().toISOString();
    return Array.from({ length: daysInMonth }, (_, index) => {
      const date = `${query.month}-${String(index + 1).padStart(2, '0')}`;
      return {
        date,
        amountMinor: deterministicPriceMinor(
          `${query.originIata}|${query.destinationIata}|${date}`,
        ),
        stops: 0,
        observedAt,
      };
    });
  }

  /**
   * SPEC-032: o dia mais barato da janela, por destino, com a mesma semente
   * do calendário — a promoção simulada confere com o calendário simulado.
   */
  async cheapestByDestination(query: CheapestByDestinationQuery): Promise<DestinationFare[]> {
    const now = this.now();
    const today = now.toISOString().slice(0, 10);
    const fares = SIMULATED_DESTINATIONS.filter((code) => code !== query.originIata).map(
      (destinationIata) => {
        let best: DestinationFare | null = null;
        for (let offset = 1; offset <= SIMULATED_WINDOW_DAYS; offset += 1) {
          const departureDate = addDays(today, offset);
          const amountMinor = deterministicPriceMinor(
            `${query.originIata}|${destinationIata}|${departureDate}`,
          );
          if (!best || amountMinor < best.amountMinor) {
            best = {
              destinationIata,
              departureDate,
              returnDate:
                query.tripType === 'ROUND_TRIP'
                  ? addDays(departureDate, SIMULATED_TRIP_LENGTH_DAYS)
                  : null,
              amountMinor,
              stops: 0,
              observedAt: now.toISOString(),
            };
          }
        }
        return best as DestinationFare;
      },
    );
    return fares.sort((a, b) => a.amountMinor - b.amountMinor);
  }

  allFlightsUrl(query: FlightSearchQuery): string {
    return `https://${SIMULATED_BOOKING_HOST}/search/${query.originIata}-${query.destinationIata}-${query.departureDate}`;
  }
}
