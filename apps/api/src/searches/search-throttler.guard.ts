import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SearchError } from '@flight-watch/contracts';

/**
 * SPEC-014 §"Segurança e privacidade": sobrescreve a exceção default da lib
 * (`ThrottlerException`, formato próprio) para lançar `SearchError` — assim
 * `POST /v1/searches/flights` responde `{code, message}` no mesmo formato de
 * todo o resto da API (via SearchErrorFilter), em vez de um segundo formato
 * de erro só pra rate limit.
 */
@Injectable()
export class SearchThrottlerGuard extends ThrottlerGuard {
  protected override async throwThrottlingException(): Promise<void> {
    throw new SearchError('RATE_LIMITED', 'too many search requests');
  }
}
