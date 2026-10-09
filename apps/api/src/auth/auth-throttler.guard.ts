import { Injectable, UseGuards, applyDecorators } from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthError } from '@flight-watch/contracts';
import { PAGES_THROTTLER, SEARCH_THROTTLER } from '../throttling/throttling.module.js';

/**
 * SPEC-025: mesmo padrão do SearchThrottlerGuard (SPEC-014) — o 429 sai no
 * formato `{code, message}` das rotas de auth, via AuthErrorFilter.
 */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected override async throwThrottlingException(): Promise<void> {
    throw new AuthError('RATE_LIMITED', 'too many authentication requests');
  }
}

/**
 * Rota pública de autenticação limitada por IP do cliente (throttler `auth`),
 * sem consumir o orçamento da busca. Não usar em rotas chamadas a cada página
 * (ex.: GET /me), senão a navegação comum esbarra no limite.
 */
export function AuthRateLimited(): MethodDecorator & ClassDecorator {
  return applyDecorators(UseGuards(AuthThrottlerGuard), SkipThrottle({ [SEARCH_THROTTLER]: true, [PAGES_THROTTLER]: true }));
}
