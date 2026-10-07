import type { FareSummaryView } from '@flight-watch/contracts';

/**
 * Modelos de visualização do front-end. `WatchStatus`, `TripType`, `AlertRuleType`
 * e o formato de `Money` seguem exatamente @flight-watch/contracts (SPEC-001) e
 * DOMAIN.md. `AlertRuleView`, `AlertHistoryItem` e `NotificationChannelView`
 * ainda não têm endpoint real (SPEC-009 §2 deixou isso de fora deliberadamente)
 * — ficam declarados aqui como intenção documentada, mas nada os produz ainda;
 * não usar em componente algum até existir uma spec/endpoint por trás.
 */

export type WatchStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';
export type TripType = 'ONE_WAY' | 'ROUND_TRIP';
export type AlertRuleType =
  'TARGET_PRICE' | 'PERCENTAGE_DROP' | 'ABSOLUTE_DROP' | 'NEW_OBSERVED_LOW';
export type ReferenceStrategy =
  'previous_valid_observation' | 'first_valid_observation' | 'lowest_valid_observation';
export type SearchExecutionOutcome =
  'succeeded' | 'no_offers' | 'retryable_failure' | 'permanent_failure' | 'rate_limited';
export type AlertEventStatus = 'pending' | 'suppressed' | 'queued' | 'notified' | 'failed';

export interface Money {
  amountMinor: number;
  currency: string;
}

export interface AlertRuleView {
  id: string;
  type: AlertRuleType;
  amountMinor: number | null;
  percent: number | null;
  dropAmountMinor: number | null;
  cooldownSeconds: number;
  referenceStrategy: ReferenceStrategy;
  enabled: boolean;
}

export interface PricePoint {
  id: string;
  observedAt: string;
  amountMinor: number;
  currency: string;
}

export interface LastCheck {
  at: string;
  outcome: SearchExecutionOutcome;
}

export interface AlertHistoryItem {
  id: string;
  ruleType: AlertRuleType;
  triggeredAt: string;
  currentAmountMinor: number;
  referenceAmountMinor: number | null;
  currency: string;
  status: AlertEventStatus;
  explanation: string;
}

export interface NotificationChannelView {
  id: string;
  type: 'EMAIL';
  destinationMasked: string;
  verified: boolean;
}

/** SPEC-018: `null` quando não há observação ou o link não passa na validação. */
export interface CurrentOffer {
  amountMinor: number;
  currency: string;
  purchaseUrl: string;
  provider: string;
  observedAt: string;
  expiresAt: string | null;
  status: 'CURRENT' | 'EXPIRED';
}

export interface WatchSummary {
  id: string;
  status: WatchStatus;
  origin: string;
  destination: string;
  /** SPEC-029: nome da cidade no catálogo; null quando o código não tem cadastro. */
  originName: string | null;
  destinationName: string | null;
  tripType: TripType;
  departureDate: string;
  returnDate: string | null;
  currency: string;
  currentPrice: Money | null;
  lowestPrice: Money | null;
  targetAmountMinor: number | null;
  lastCheck: LastCheck | null;
  createdAt: string;
  expiresAt: string | null;
  currentOffer: CurrentOffer | null;
}

/** SPEC-009 §7: exatamente o que `GET /v1/watches/:id` devolve hoje. */
export interface WatchDetail extends WatchSummary {
  priceHistory: PricePoint[];
}

export type FlightSearchStatus =
  'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'EXPIRED';

export interface FlightSearchOfferSegmentView {
  originIata: string;
  destinationIata: string;
  departureAt: string;
  arrivalAt: string;
  carrier: string;
}

/** SPEC-014: `purchaseUrl` é `null` quando o link não passa na allowlist. */
export interface FlightSearchOfferView {
  id: string;
  searchId: string;
  provider: string;
  segments: FlightSearchOfferSegmentView[];
  /** SPEC-030: preenchido (e `segments` vazio) quando a oferta vem de cache de preços. */
  fareSummary: FareSummaryView | null;
  totalAmountMinor: number;
  currency: string;
  passengerCount: number;
  cabin: string;
  durationMinutes: number | null;
  connectionsCount: number;
  observedAt: string;
  expiresAt: string | null;
  purchaseUrl: string | null;
  availabilityStatus: 'CURRENT' | 'EXPIRED';
  qualityFlags: string[];
}

export interface FlightSearchResult {
  id: string;
  status: FlightSearchStatus;
  origin: string;
  destination: string;
  /** SPEC-029: nome da cidade no catálogo; null quando o código não tem cadastro. */
  originName: string | null;
  destinationName: string | null;
  tripType: TripType;
  departureDate: string;
  returnDate: string | null;
  currency: string;
  market: string;
  errorCode: string | null;
  createdAt: string;
  expiresAt: string | null;
  offers: FlightSearchOfferView[];
}

export type DealType = 'HISTORICAL_LOW' | 'PERCENTAGE_BELOW_REFERENCE';
export type DealConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

/** SPEC-015: `Deal` nunca é persistido no backend — computado a cada leitura. */
export interface Deal {
  dealType: DealType;
  referenceAmountMinor: number;
  currentAmountMinor: number;
  currency: string;
  dropPercent: number | null;
  confidence: DealConfidence;
  observationCount: number;
  explanation: string;
  validFrom: string;
  validUntil: string | null;
}

export interface OpportunityOffer {
  amountMinor: number;
  currency: string;
  purchaseUrl: string | null;
  provider: string;
  observedAt: string;
  expiresAt: string | null;
  status: 'CURRENT' | 'EXPIRED';
  segments: FlightSearchOfferSegmentView[];
  /** SPEC-030: preenchido (e `segments` vazio) quando a oferta vem de cache de preços. */
  fareSummary: FareSummaryView | null;
  durationMinutes: number | null;
  connectionsCount: number;
}

export interface OpportunityItem {
  searchTargetId: string;
  origin: string;
  destination: string;
  /** SPEC-029: nome da cidade no catálogo; null quando o código não tem cadastro. */
  originName: string | null;
  destinationName: string | null;
  /** SPEC-029: coordenadas da cidade para o mapa; null sem cadastro. */
  originCoordinates: Coordinates | null;
  destinationCoordinates: Coordinates | null;
  tripType: TripType;
  market: string;
  departureDate: string;
  returnDate: string | null;
  deal: Deal;
  offer: OpportunityOffer;
}

/** SPEC-029: cidade do catálogo, com os aeroportos comerciais dela. */
export type { Place } from '@flight-watch/contracts';

export interface Coordinates {
  lat: number;
  lng: number;
}

/** SPEC-030: menor preço encontrado para a rota e o dia (sem horário nem companhia). */
export type { FareSummaryView };
