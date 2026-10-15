import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { CaptchaErrorCode } from '@flight-watch/contracts';
import { logEvent } from '@flight-watch/observability';
import { API_CONFIG, type ApiConfig } from '../config/config.module.js';
import { MetricsService } from '../observability/metrics.service.js';
import { resolveClientIp } from '../throttling/client-ip.js';

export const CAPTCHA_VERIFIER = Symbol('CAPTCHA_VERIFIER');

export type CaptchaVerdict = 'passed' | 'failed' | 'unavailable';

/** SPEC-041: porta do verificador; desligada quando não há segredo. */
export interface CaptchaVerifier {
  readonly enabled: boolean;
  verify(token: string, remoteIp: string): Promise<CaptchaVerdict>;
}

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const SITEVERIFY_TIMEOUT_MS = 5_000;

/** Cloudflare Turnstile: `success: true` aprova; resposta inválida ou rede fora é "indisponível". */
export class TurnstileVerifier implements CaptchaVerifier {
  readonly enabled = true;

  constructor(
    private readonly secret: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async verify(token: string, remoteIp: string): Promise<CaptchaVerdict> {
    let response: Response;
    try {
      response = await this.fetchFn(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: this.secret, response: token, remoteip: remoteIp }),
        signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
      });
    } catch {
      return 'unavailable';
    }
    if (!response.ok) return 'unavailable';
    try {
      const body = (await response.json()) as { success?: unknown };
      return body.success === true ? 'passed' : 'failed';
    } catch {
      return 'unavailable';
    }
  }
}

export class DisabledCaptchaVerifier implements CaptchaVerifier {
  readonly enabled = false;
  verify(): Promise<CaptchaVerdict> {
    return Promise.resolve('passed');
  }
}

export function createCaptchaVerifier(config: ApiConfig): CaptchaVerifier {
  return config.TURNSTILE_SECRET_KEY
    ? new TurnstileVerifier(config.TURNSTILE_SECRET_KEY)
    : new DisabledCaptchaVerifier();
}

function captchaError(code: CaptchaErrorCode, message: string): BadRequestException {
  return new BadRequestException({ code, message });
}

/**
 * SPEC-041: roda antes da validação do corpo e de qualquer acesso ao banco —
 * robô não gasta hash de senha nem dispara e-mail. Cloudflare fora deixa
 * passar (o rate limit `auth` continua valendo) e fica registrado.
 */
@Injectable()
export class CaptchaGuard implements CanActivate {
  constructor(
    @Inject(CAPTCHA_VERIFIER) private readonly verifier: CaptchaVerifier,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly metrics: MetricsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.verifier.enabled) return true;
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const body = request.body as { captchaToken?: unknown } | undefined;
    const token = typeof body?.captchaToken === 'string' ? body.captchaToken.trim() : '';
    if (!token) {
      this.metrics.authCaptchaTotal.inc({ result: 'missing' });
      throw captchaError('CAPTCHA_REQUIRED', 'captcha token is required');
    }
    const ip = resolveClientIp(request.headers, request.ip, this.config.INTERNAL_API_SECRET);
    const verdict = await this.verifier.verify(token, ip);
    this.metrics.authCaptchaTotal.inc({ result: verdict });
    if (verdict === 'failed') {
      throw captchaError('CAPTCHA_FAILED', 'captcha verification failed');
    }
    if (verdict === 'unavailable') {
      logEvent({ event: 'captcha_unavailable' });
    }
    return true;
  }
}
