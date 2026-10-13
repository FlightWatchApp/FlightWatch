import type { NestFastifyApplication } from '@nestjs/platform-fastify';

/**
 * Headers de segurança de toda resposta da API. Ela só devolve JSON e é
 * chamada pelo site (BFF), nunca embutida em página: nada de sniffing de
 * tipo, nada de frame, nada de referrer.
 */
export const API_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
};

export function registerSecurityHeaders(app: NestFastifyApplication): void {
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onSend', (_request, reply, payload, done) => {
      for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) {
        reply.header(name, value);
      }
      done(null, payload);
    });
}
