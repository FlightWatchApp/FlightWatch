export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Circuit breaker simples de 3 estados (ARCHITECTURE.md §9). CLOSED deixa passar;
 * após N falhas seguidas abre (OPEN) e rejeita sem tentar; depois de
 * `resetTimeoutMs` permite uma tentativa de sonda (HALF_OPEN) — sucesso fecha de
 * novo, falha reabre.
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private consecutiveFailures = 0;
  private openedAt: number | null = null;

  constructor(
    private readonly failureThreshold: number,
    private readonly resetTimeoutMs: number,
  ) {}

  canAttempt(now: number = Date.now()): boolean {
    if (this.state === 'OPEN') {
      if (this.openedAt !== null && now - this.openedAt >= this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = 'CLOSED';
    this.openedAt = null;
  }

  recordFailure(now: number = Date.now()): void {
    this.consecutiveFailures += 1;
    if (this.state === 'HALF_OPEN' || this.consecutiveFailures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.openedAt = now;
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }
}
