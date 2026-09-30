/**
 * Token bucket em memória, por processo. Suficiente para o provedor simulado
 * de um único worker; um provedor real com múltiplas réplicas de worker precisa
 * de coordenação distribuída (Redis) — ARCHITECTURE.md §10, adiado até lá.
 */
export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefillAt: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    now: number = Date.now(),
  ) {
    this.tokens = capacity;
    this.lastRefillAt = now;
  }

  private refill(now: number): void {
    const elapsedSeconds = (now - this.lastRefillAt) / 1000;
    if (elapsedSeconds <= 0) {
      return;
    }
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond);
    this.lastRefillAt = now;
  }

  tryAcquire(now: number = Date.now()): boolean {
    this.refill(now);
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
}
