import { Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  createMetricsRegistry,
  type Registry,
} from '@flight-watch/observability';

/**
 * ADR-007: um Registry por processo. Nomes de métrica literais conforme
 * cada spec — sem prefixo adicional, pra bater exatamente com o documentado.
 */
@Injectable()
export class MetricsService {
  readonly registry: Registry = createMetricsRegistry();

  /** SPEC-001 §13. */
  readonly watchCreateTotal = new Counter({
    name: 'watch_create_total',
    help: 'Total de tentativas de criação de Watch, por resultado (SPEC-001 §13).',
    labelNames: ['result'],
    registers: [this.registry],
  });

  /** SPEC-008 §13. */
  readonly watchLifecycleTransitionTotal = new Counter({
    name: 'watch_lifecycle_transition_total',
    help: 'Total de ações de ciclo de vida de Watch, por ação e resultado (SPEC-008 §13).',
    labelNames: ['action', 'result'],
    registers: [this.registry],
  });

  /** SPEC-009 §13. */
  readonly watchDetailFetchTotal = new Counter({
    name: 'watch_detail_fetch_total',
    help: 'Total de buscas de detalhe/histórico de Watch, por resultado (SPEC-009 §13).',
    labelNames: ['result'],
    registers: [this.registry],
  });

  /** SPEC-007 §13. */
  readonly authRegisterTotal = new Counter({
    name: 'auth_register_total',
    help: 'Total de tentativas de registro, por resultado (SPEC-007 §13).',
    labelNames: ['result'],
    registers: [this.registry],
  });

  /** SPEC-007 §13. */
  readonly authLoginTotal = new Counter({
    name: 'auth_login_total',
    help: 'Total de tentativas de login, por resultado — success/invalid_credentials/locked/account_not_active (SPEC-007 §13).',
    labelNames: ['result'],
    registers: [this.registry],
  });

  /** SPEC-010 §14. */
  readonly authVerifyEmailTotal = new Counter({
    name: 'auth_verify_email_total',
    help: 'Total de confirmações de e-mail, por resultado — success/already_verified/invalid_verification_token/verification_token_expired (SPEC-010 §14).',
    labelNames: ['result'],
    registers: [this.registry],
  });

  /** SPEC-010 §14. */
  readonly authResendVerificationTotal = new Counter({
    name: 'auth_resend_verification_total',
    help: 'Total de reenvios de confirmação de e-mail, por resultado — sent/already_verified (SPEC-010 §14).',
    labelNames: ['result'],
    registers: [this.registry],
  });

  /** SPEC-026 §"Observabilidade". */
  readonly authPasswordResetTotal = new Counter({
    name: 'auth_password_reset_total',
    help: 'Recuperação de senha por etapa e resultado — request: sent/ignored; confirm: success/invalid_reset_token/reset_token_expired (SPEC-026).',
    labelNames: ['step', 'result'],
    registers: [this.registry],
  });

  /** SPEC-027 §"Observabilidade". */
  readonly authAccountDeletionTotal = new Counter({
    name: 'auth_account_deletion_total',
    help: 'Exclusões de conta pelo próprio usuário, por resultado — success/invalid_credentials/account_locked (SPEC-027).',
    labelNames: ['result'],
    registers: [this.registry],
  });

  /** SPEC-031: aberturas do calendário de preços, por resultado. */
  readonly priceCalendarFetchTotal = new Counter({
    name: 'price_calendar_fetch_total',
    help: 'Consultas ao calendário de preços, por resultado — success/empty/provider_error/not_supported (SPEC-031).',
    labelNames: ['result'],
    registers: [this.registry],
  });

  /** SPEC-018 §"Observabilidade". */
  readonly watchPurchaseLinkClickTotal = new Counter({
    name: 'watch_purchase_link_click_total',
    help: 'Total de cliques no link de compra a partir de um Watch, por provider e status do currentOffer no momento do clique (SPEC-018).',
    labelNames: ['provider', 'status'],
    registers: [this.registry],
  });

  /** SPEC-018 §"Observabilidade". */
  readonly purchaseLinkMissingTotal = new Counter({
    name: 'purchase_link_missing_total',
    help: 'Total de listagens em que existe observação de preço mas nenhum link de compra pôde ser projetado, por provider (SPEC-018).',
    labelNames: ['provider'],
    registers: [this.registry],
  });

  /** SPEC-014 §"Observabilidade". */
  readonly flightSearchTotal = new Counter({
    name: 'flight_search_total',
    help: 'Total de buscas de descoberta, por resultado e modo (SPEC-014).',
    labelNames: ['result', 'mode'],
    registers: [this.registry],
  });

  /** SPEC-014 §"Observabilidade". */
  readonly flightSearchDurationSeconds = new Histogram({
    name: 'flight_search_duration_seconds',
    help: 'Duração da chamada ao provider numa busca de descoberta, por provider (SPEC-014).',
    labelNames: ['provider'],
    registers: [this.registry],
  });

  /** SPEC-014 §"Observabilidade". */
  readonly flightOffersReturnedTotal = new Counter({
    name: 'flight_offers_returned_total',
    help: 'Total de ofertas elegíveis devolvidas por buscas de descoberta, por provider (SPEC-014).',
    labelNames: ['provider'],
    registers: [this.registry],
  });

  /** SPEC-014 §"Observabilidade": consistência com watchCreateTotal/authRegisterTotal. */
  readonly flightOfferWatchDeriveTotal = new Counter({
    name: 'flight_offer_watch_derive_total',
    help: 'Total de tentativas de derivar um Watch a partir de uma oferta de busca, por resultado (SPEC-014).',
    labelNames: ['result'],
    registers: [this.registry],
  });

  /** SPEC-015 §"Observabilidade". */
  readonly opportunitiesFeedFetchTotal = new Counter({
    name: 'opportunities_feed_fetch_total',
    help: 'Total de buscas ao feed de oportunidades, por resultado (SPEC-015).',
    labelNames: ['result'],
    registers: [this.registry],
  });

  /** SPEC-015 §"Observabilidade": mesmo nome já previsto em 04-domain-and-platform-evolution.md. */
  readonly dealClassificationTotal = new Counter({
    name: 'deal_classification_total',
    help: 'Total de ofertas classificadas como oportunidade, por tipo de deal (SPEC-015).',
    labelNames: ['type'],
    registers: [this.registry],
  });

  /** SPEC-032 §Observabilidade. Origem nunca vira label (cardinalidade). */
  readonly promotionFeedRequestsTotal = new Counter({
    name: 'promotion_feed_requests_total',
    help: 'Requisições ao feed de promoções, por cache (hit/miss/stale/none) e resultado (ok/budget_exhausted/provider_unavailable/disabled) (SPEC-032).',
    labelNames: ['cache', 'result'],
    registers: [this.registry],
  });

  readonly promotionProviderCallsTotal = new Counter({
    name: 'promotion_provider_calls_total',
    help: 'Consultas do feed de promoções à fonte, por tipo (candidates/month) e resultado (ok/error/rate_limited/cache_hit/budget_exhausted) (SPEC-032).',
    labelNames: ['kind', 'result'],
    registers: [this.registry],
  });

  readonly promotionEvaluationsTotal = new Counter({
    name: 'promotion_evaluations_total',
    help: 'Candidatos avaliados, por resultado (qualifies/suspect/not_promotional/insufficient_data/invalid_price) (SPEC-032).',
    labelNames: ['result'],
    registers: [this.registry],
  });

  readonly promotionBudgetRemaining = new Gauge({
    name: 'promotion_budget_remaining',
    help: 'Chamadas à fonte que ainda cabem no orçamento do feed hoje (dia UTC) (SPEC-032).',
    registers: [this.registry],
  });

  readonly promotionFeedDurationSeconds = new Histogram({
    name: 'promotion_feed_duration_seconds',
    help: 'Duração da resposta do feed de promoções, por cache (SPEC-032).',
    labelNames: ['cache'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 20],
    registers: [this.registry],
  });
}
