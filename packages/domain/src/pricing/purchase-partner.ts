/**
 * SPEC-044 / ADR-009 — para onde o botão de compra leva. O link é montado na
 * hora, a partir dos dados da viagem, e não lido de um endereço gravado: o
 * `deeplink` guardado nas observações é sempre o da fonte de preços
 * (Aviasales), e uma observação sem mudança de preço nem gera registro novo —
 * trocar o parceiro só no gerador deixaria links antigos no ar por semanas.
 *
 * Funções puras. Nada aqui lança: dado inválido vira `null` (sem link), nunca
 * uma URL montada com lixo (CLAUDE.md §12: URL externa passa por allowlist).
 */

/** Valores de `PURCHASE_PARTNER`: `provider` usa o link da própria fonte de preços. */
export const PURCHASE_PARTNERS = ['provider', 'decolar'] as const;
export type PurchasePartner = (typeof PURCHASE_PARTNERS)[number];

/** O que o parceiro precisa saber da viagem para abrir a busca certa. */
export interface PurchaseTrip {
  /** Código IATA de cidade (3 letras maiúsculas), como no catálogo (SPEC-029). */
  originCode: string;
  destinationCode: string;
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  /** AAAA-MM-DD, sem fuso (CLAUDE.md §8.2). */
  departureDate: string;
  returnDate: string | null;
  adults: number;
}

const DECOLAR_RESULTS_URL = 'https://www.decolar.com/shop/flights/results';
const IATA_CITY = /^[A-Z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ADULTS = 9;

/**
 * Busca da Decolar com origem, destino, datas e adultos preenchidos. Formato
 * copiado de buscas reais feitas no site em 2026-10-26 (ver o teste, que
 * reproduz os três endereços): só ida usa `oneway`; na ida e volta o próprio
 * site leva a `multioneway` com as duas datas.
 *
 * Por que `multioneway` na volta: foi o que o site produziu para uma busca de
 * ida e volta; o caminho `roundtrip` não foi observado e não é chutado.
 * `di` é a distribuição de passageiros — só adultos aqui, os dois outros
 * contadores (crianças e bebês) ficam em 0.
 */
export function buildDecolarSearchUrl(trip: PurchaseTrip): string | null {
  if (!IATA_CITY.test(trip.originCode) || !IATA_CITY.test(trip.destinationCode)) {
    return null;
  }
  if (!Number.isInteger(trip.adults) || trip.adults < 1 || trip.adults > MAX_ADULTS) {
    return null;
  }
  if (!ISO_DATE.test(trip.departureDate)) {
    return null;
  }
  const route = `${trip.originCode}/${trip.destinationCode}`;
  const passengers = `${trip.adults}/0/0`;

  if (trip.tripType === 'ONE_WAY') {
    if (trip.returnDate !== null) {
      return null;
    }
    return `${DECOLAR_RESULTS_URL}/oneway/${route}/${trip.departureDate}/${passengers}?from=SB&di=${trip.adults}`;
  }

  if (trip.returnDate === null || !ISO_DATE.test(trip.returnDate)) {
    return null;
  }
  // AAAA-MM-DD compara certo como texto; volta no mesmo dia ou antes não é viagem.
  if (trip.returnDate <= trip.departureDate) {
    return null;
  }
  return `${DECOLAR_RESULTS_URL}/multioneway/${route}/${trip.departureDate}/${trip.returnDate}/${passengers}?from=SB&di=${trip.adults}&isRedirectFromRoundtrip=true`;
}
