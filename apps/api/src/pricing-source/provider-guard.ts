import { Inject, Injectable } from '@nestjs/common';
import { logEvent } from '@flight-watch/observability';
import type { ProviderError } from '@flight-watch/providers';
import { KEY_VALUE_STORE, type KeyValueStore } from './key-value-store.js';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** 429 sem Retry-After: sem novas chamadas por este tempo. */
const DEFAULT_RETRY_AFTER_MS = MINUTE_MS;
const COOLDOWN_KEY = 'pricing-source:cooldown:v1';
const BUDGET_KEY_TTL_MS = 2 * DAY_MS;

/**
 * Retry-After da fonte de preços (H08), compartilhado por quem consulta a
 * fonte por conta própria (feed de promoções, página da rota): um 429 vale
 * para o token inteiro, então pausa todos. Redis fora: vale a pausa local
 * deste processo.
 */
@Injectable()
export class ProviderCooldown {
  private localUntil = 0;

  constructor(@Inject(KEY_VALUE_STORE) private readonly store: KeyValueStore) {}

  async active(): Promise<boolean> {
    if (this.localUntil > Date.now()) return true;
    try {
      const until = Number(await this.store.get(COOLDOWN_KEY));
      return Number.isFinite(until) && until > Date.now();
    } catch {
      return false;
    }
  }

  /** Rótulo da métrica; 429 suspende as chamadas até o Retry-After. */
  async note(error: ProviderError, event: string): Promise<'error' | 'rate_limited'> {
    if (error.errorClass !== 'RATE_LIMITED') return 'error';
    const waitMs = error.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS;
    const until = Date.now() + waitMs;
    this.localUntil = Math.max(this.localUntil, until);
    try {
      await this.store.set(COOLDOWN_KEY, String(until), Math.max(1, waitMs));
    } catch {
      // Redis fora: vale a pausa local deste processo.
    }
    logEvent({ event, retryAfterMs: waitMs });
    return 'rate_limited';
  }
}

export interface DailyCallBudgetOptions {
  /** Prefixo da chave no Redis; o dia UTC completa a chave. */
  keyPrefix: string;
  limit: number;
  /** Evento de log na primeira recusa do dia. */
  exhaustedEvent: string;
  onRemaining?: (remaining: number) => void;
}

/**
 * Orçamento diário (dia UTC) de chamadas à fonte, contado no Redis; local
 * deste processo se o Redis cair. Cada consumidor tem o seu: robôs de busca
 * abrindo páginas de rota não gastam o orçamento do feed.
 */
export class DailyCallBudget {
  private local = { day: '', used: 0 };

  constructor(
    private readonly store: KeyValueStore,
    private readonly options: DailyCallBudgetOptions,
  ) {}

  /** Conta a chamada; false quando o orçamento do dia acabou. */
  async reserve(now: Date = new Date()): Promise<boolean> {
    const day = now.toISOString().slice(0, 10);
    let used: number;
    try {
      used = await this.store.increment(`${this.options.keyPrefix}:${day}`, BUDGET_KEY_TTL_MS);
    } catch {
      if (this.local.day !== day) this.local = { day, used: 0 };
      this.local.used += 1;
      used = this.local.used;
    }
    const { limit } = this.options;
    this.options.onRemaining?.(Math.max(0, limit - used));
    if (used > limit) {
      if (used === limit + 1) {
        logEvent({ event: this.options.exhaustedEvent, day, budget: limit });
      }
      return false;
    }
    return true;
  }
}
