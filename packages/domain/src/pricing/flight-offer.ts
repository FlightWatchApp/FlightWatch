export interface FlightOfferSegment {
  originIata: string;
  destinationIata: string;
  departureAt: string;
  arrivalAt: string;
  carrier: string;
}

export interface FlightOffer {
  providerOfferId: string;
  totalAmountMinor: number;
  currency: string;
  passengerCount: number;
  segments: FlightOfferSegment[];
  observedAt: string;
  expiresAt?: string;
  deeplink?: string;
  qualityFlags?: string[];
}

export interface OfferEligibilityContext {
  originIata: string;
  destinationIata: string;
  currency: string;
  adults: number;
  /** YYYY-MM-DD — precisa bater com a data de partida realmente pesquisada. */
  departureDate: string;
  /** Injetável para teste; default `new Date()`. */
  now?: Date;
}

const IATA_CODE_PATTERN = /^[A-Z]{3}$/;

/**
 * Regressão: só o primeiro `originIata` e o último `destinationIata` eram
 * comparados contra a consulta (que já veio validada) — os aeroportos de
 * CONEXÃO no meio de um itinerário com mais de um trecho nunca eram checados
 * quanto a formato, só quanto a consistência interna (`destinationIata` de um
 * trecho bate com `originIata` do próximo). Um provedor podia devolver
 * `originIata: ""`/`destinationIata: ""` num trecho de conexão — string vazia
 * bate com string vazia — e a oferta passava validação mesmo assim.
 */
function areAllSegmentIataCodesWellFormed(segments: readonly FlightOfferSegment[]): boolean {
  return segments.every(
    (segment) =>
      IATA_CODE_PATTERN.test(segment.originIata) && IATA_CODE_PATTERN.test(segment.destinationIata),
  );
}

function areSegmentsChronologicallyConsistent(segments: readonly FlightOfferSegment[]): boolean {
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment) {
      return false;
    }
    const departureAt = new Date(segment.departureAt).getTime();
    const arrivalAt = new Date(segment.arrivalAt).getTime();
    if (Number.isNaN(departureAt) || Number.isNaN(arrivalAt) || arrivalAt <= departureAt) {
      return false; // chegada precisa ser estritamente depois da partida do mesmo trecho.
    }

    const next = segments[index + 1];
    if (next) {
      if (segment.destinationIata !== next.originIata) {
        return false; // conexão não fecha: trecho seguinte não parte de onde este chegou.
      }
      const nextDepartureAt = new Date(next.departureAt).getTime();
      if (Number.isNaN(nextDepartureAt) || nextDepartureAt < arrivalAt) {
        return false; // próximo trecho partindo antes de chegar no anterior.
      }
    }
  }
  return true;
}

// SPEC-003 §4: oferta sem total/moeda/rota/data/correspondência com a consulta é
// rejeitada, não vira observação. DR-013: total deve cobrir todos os passageiros
// da consulta. Itinerário com trechos fora de ordem ou conexão que não fecha
// também é rejeitado — não é "correspondência com a consulta" só porque o
// primeiro/último aeroporto batem.
export function isOfferEligible(offer: FlightOffer, context: OfferEligibilityContext): boolean {
  if (!Number.isInteger(offer.totalAmountMinor) || offer.totalAmountMinor <= 0) {
    return false;
  }
  if (offer.currency !== context.currency) {
    return false;
  }
  if (offer.passengerCount !== context.adults) {
    return false;
  }
  const first = offer.segments[0];
  const last = offer.segments[offer.segments.length - 1];
  if (!first || !last) {
    return false;
  }
  if (!areAllSegmentIataCodesWellFormed(offer.segments)) {
    return false;
  }
  if (first.originIata !== context.originIata || last.destinationIata !== context.destinationIata) {
    return false;
  }
  if (first.departureAt.slice(0, 10) !== context.departureDate) {
    return false;
  }
  if (!areSegmentsChronologicallyConsistent(offer.segments)) {
    return false;
  }
  if (offer.expiresAt) {
    const now = context.now ?? new Date();
    if (new Date(offer.expiresAt).getTime() <= now.getTime()) {
      return false; // oferta expirada não é uma oferta válida, mesmo que o preço bata.
    }
  }
  return true;
}

/**
 * ADR-007 / SPEC-003 §11: `offers_eligible_total` precisa desse número sem
 * duplicar o filtro de `selectBestOffer` (que só retorna a vencedora, não a
 * contagem) — reusa `isOfferEligible` diretamente pra nunca divergir do
 * critério real de elegibilidade.
 */
export function countEligibleOffers(
  offers: FlightOffer[],
  context: OfferEligibilityContext,
): number {
  return offers.filter((offer) => isOfferEligible(offer, context)).length;
}

/** Assinatura normalizada do itinerário — usada em desempate e na chave de idempotência. */
export function buildOfferSignature(offer: FlightOffer): string {
  return offer.segments
    .map((s) => `${s.originIata}|${s.destinationIata}|${s.departureAt}|${s.arrivalAt}|${s.carrier}`)
    .join('>>');
}

export function offerDurationMinutes(offer: FlightOffer): number {
  const first = offer.segments[0];
  const last = offer.segments[offer.segments.length - 1];
  if (!first || !last) {
    throw new Error('offerDurationMinutes requires at least one segment');
  }
  return Math.round(
    (new Date(last.arrivalAt).getTime() - new Date(first.departureAt).getTime()) / 60_000,
  );
}

export function offerConnectionsCount(offer: FlightOffer): number {
  if (offer.segments.length === 0) {
    throw new Error('offerConnectionsCount requires at least one segment');
  }
  return offer.segments.length - 1;
}

export const OFFER_SELECTION_POLICY_VERSION = 1;

export interface SelectedOffer {
  offer: FlightOffer;
  signature: string;
  selectionPolicyVersion: number;
}

/**
 * SPEC-004 §3: filtra incompatíveis, ordena por menor total_amount_minor; empate
 * por menor duração total, depois menos conexões, depois assinatura normalizada
 * lexicograficamente menor. `null` quando nenhuma oferta elegível existe — o
 * chamador trata isso como resultado `no_offers`, nunca como preço zero.
 */
export function selectBestOffer(
  offers: FlightOffer[],
  context: OfferEligibilityContext,
): SelectedOffer | null {
  const ranked = offers
    .filter((offer) => isOfferEligible(offer, context))
    .map((offer) => ({
      offer,
      signature: buildOfferSignature(offer),
      duration: offerDurationMinutes(offer),
      connections: offerConnectionsCount(offer),
    }))
    .sort((a, b) => {
      if (a.offer.totalAmountMinor !== b.offer.totalAmountMinor) {
        return a.offer.totalAmountMinor - b.offer.totalAmountMinor;
      }
      if (a.duration !== b.duration) {
        return a.duration - b.duration;
      }
      if (a.connections !== b.connections) {
        return a.connections - b.connections;
      }
      return a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0;
    });

  const winner = ranked[0];
  if (!winner) {
    return null;
  }
  return {
    offer: winner.offer,
    signature: winner.signature,
    selectionPolicyVersion: OFFER_SELECTION_POLICY_VERSION,
  };
}
