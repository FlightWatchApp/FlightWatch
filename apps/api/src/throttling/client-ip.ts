import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { CLIENT_IP_HEADER, INTERNAL_SECRET_HEADER } from '@flight-watch/contracts';

type Headers = Readonly<Record<string, string | string[] | undefined>>;

function secretMatches(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  // timingSafeEqual exige tamanhos iguais; comparar o tamanho antes vaza só
  // o comprimento, que não ajuda a adivinhar o segredo.
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

/**
 * SPEC-025: a API só vê o IP do servidor web (BFF, ADR-006). O web informa o
 * IP do cliente em CLIENT_IP_HEADER, autenticado pelo segredo interno — sem o
 * segredo, o header é ignorado e o cliente não escolhe a própria identidade
 * de rate limit.
 */
export function resolveClientIp(headers: Headers, socketIp: string, secret: string): string {
  const forwardedIp = headers[CLIENT_IP_HEADER];
  const receivedSecret = headers[INTERNAL_SECRET_HEADER];
  if (
    typeof forwardedIp === 'string' &&
    typeof receivedSecret === 'string' &&
    isIP(forwardedIp) !== 0 &&
    secretMatches(receivedSecret, secret)
  ) {
    return forwardedIp;
  }
  return socketIp;
}
