import { describe, expect, it } from 'vitest';
import { CLIENT_IP_HEADER, INTERNAL_SECRET_HEADER } from '@flight-watch/contracts';
import { resolveClientIp } from './client-ip.js';

const SECRET = 'a-shared-internal-secret-with-32-chars!';
const SOCKET_IP = '10.0.0.5';

function headers(values: Record<string, string>): Record<string, string> {
  return values;
}

describe('resolveClientIp (SPEC-025)', () => {
  it('usa o IP informado pelo web quando o segredo confere', () => {
    expect(
      resolveClientIp(
        headers({ [CLIENT_IP_HEADER]: '177.10.20.30', [INTERNAL_SECRET_HEADER]: SECRET }),
        SOCKET_IP,
        SECRET,
      ),
    ).toBe('177.10.20.30');
  });

  it('aceita IPv6', () => {
    expect(
      resolveClientIp(
        headers({ [CLIENT_IP_HEADER]: '2804:14c::1', [INTERNAL_SECRET_HEADER]: SECRET }),
        SOCKET_IP,
        SECRET,
      ),
    ).toBe('2804:14c::1');
  });

  // AC-2
  it('ignora o IP informado sem o segredo', () => {
    expect(resolveClientIp(headers({ [CLIENT_IP_HEADER]: '1.2.3.4' }), SOCKET_IP, SECRET)).toBe(
      SOCKET_IP,
    );
  });

  it('ignora o IP informado com segredo errado, inclusive de mesmo tamanho', () => {
    const wrong = SECRET.replace(/.$/, '?');
    expect(
      resolveClientIp(
        headers({ [CLIENT_IP_HEADER]: '1.2.3.4', [INTERNAL_SECRET_HEADER]: wrong }),
        SOCKET_IP,
        SECRET,
      ),
    ).toBe(SOCKET_IP);
    expect(
      resolveClientIp(
        headers({ [CLIENT_IP_HEADER]: '1.2.3.4', [INTERNAL_SECRET_HEADER]: 'curto' }),
        SOCKET_IP,
        SECRET,
      ),
    ).toBe(SOCKET_IP);
  });

  // AC-3
  it.each(['not-an-ip', '1.2.3.4, 5.6.7.8', '999.1.1.1', ''])(
    'ignora IP com formato inválido: %j',
    (value) => {
      expect(
        resolveClientIp(
          headers({ [CLIENT_IP_HEADER]: value, [INTERNAL_SECRET_HEADER]: SECRET }),
          SOCKET_IP,
          SECRET,
        ),
      ).toBe(SOCKET_IP);
    },
  );

  it('ignora header repetido (array)', () => {
    expect(
      resolveClientIp(
        { [CLIENT_IP_HEADER]: ['1.2.3.4', '5.6.7.8'], [INTERNAL_SECRET_HEADER]: SECRET },
        SOCKET_IP,
        SECRET,
      ),
    ).toBe(SOCKET_IP);
  });
});
