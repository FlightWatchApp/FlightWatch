import { randomUUID } from 'node:crypto';
import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyRequest } from 'fastify';

export const CORRELATION_HEADER = 'x-correlation-id';
const MAX_LENGTH = 128;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\x00-\x1f\x7f]/;

export interface CorrelatedRequest extends FastifyRequest {
  correlationId: string;
}

/**
 * SPEC-013 §4: nunca reflete um `x-correlation-id` de entrada não sanitizado
 * de volta no header de resposta — string vazia, longa demais ou com
 * caractere de controle vira um id gerado, não propagado. Exportada (não
 * embutida no hook do Fastify) para ser testável isoladamente.
 */
export function resolveCorrelationId(header: string | string[] | undefined): string {
  const raw = Array.isArray(header) ? header[0] : header;
  if (raw && raw.length > 0 && raw.length <= MAX_LENGTH && !CONTROL_CHARACTERS.test(raw)) {
    return raw;
  }
  return randomUUID();
}

/**
 * SPEC-013 §4: lê o `correlationId` que o hook `onRequest` do Fastify já
 * colocou na requisição — mesmo padrão de `@CurrentUser()`/
 * `@CurrentSessionToken()`, só que preenchido antes de qualquer guard rodar,
 * não por um guard.
 */
export const CurrentCorrelationId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<CorrelatedRequest>();
    return request.correlationId;
  },
);

/**
 * SPEC-013 §4: hook onRequest do Fastify, não middleware/interceptor do Nest
 * — precisa rodar ANTES de qualquer guard (senão uma requisição rejeitada
 * por SessionAuthGuard, 401, nunca ganharia o header de resposta).
 *
 * Extraída como função compartilhada (não inline em main.ts) porque os
 * testes e2e criam a aplicação via `Test.createTestingModule` +
 * `app.init()`, nunca chamando `bootstrap()` de main.ts — sem isso, o hook
 * só existiria no servidor real e o `correlationId` apareceria como
 * `undefined` em todo teste (foi exatamente o que aconteceu na primeira
 * versão desta spec, pego pelos próprios testes e2e).
 */
export function registerCorrelationHook(app: NestFastifyApplication): void {
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request, reply, done) => {
      const correlationId = resolveCorrelationId(
        request.headers[CORRELATION_HEADER] as string | string[] | undefined,
      );
      (request as CorrelatedRequest).correlationId = correlationId;
      reply.header(CORRELATION_HEADER, correlationId);
      done();
    });
}
