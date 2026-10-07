import { describe, expect, it } from 'vitest';
import { CLIENT_IP_HEADER, INTERNAL_SECRET_HEADER } from '@flight-watch/contracts';
import { LOCAL_INTERNAL_API_SECRET } from '@flight-watch/config';
import { clientIpFrom, internalApiHeaders, resolveInternalApiSecret } from './internal-headers';

describe('clientIpFrom (SPEC-025 AC-7)', () => {
  it('usa o primeiro IP de x-forwarded-for', () => {
    expect(clientIpFrom('177.10.20.30, 10.0.0.1, 10.0.0.2', null)).toBe('177.10.20.30');
  });

  it('cai para x-real-ip sem x-forwarded-for', () => {
    expect(clientIpFrom(null, '2804:14c::1')).toBe('2804:14c::1');
  });

  it('não informa IP quando não há nenhum header', () => {
    expect(clientIpFrom(null, null)).toBeUndefined();
    expect(clientIpFrom('  ', null)).toBeUndefined();
  });
});

describe('internalApiHeaders', () => {
  it('envia o segredo e o IP do cliente', () => {
    expect(internalApiHeaders({ clientIp: '177.10.20.30', secret: 's' })).toEqual({
      [INTERNAL_SECRET_HEADER]: 's',
      [CLIENT_IP_HEADER]: '177.10.20.30',
    });
  });

  it('envia só o segredo quando o IP é desconhecido', () => {
    expect(internalApiHeaders({ clientIp: undefined, secret: 's' })).toEqual({
      [INTERNAL_SECRET_HEADER]: 's',
    });
  });
});

describe('resolveInternalApiSecret', () => {
  it('usa a variável quando definida', () => {
    expect(
      resolveInternalApiSecret({
        INTERNAL_API_SECRET: 'segredo-de-producao',
        NODE_ENV: 'production',
      }),
    ).toBe('segredo-de-producao');
  });

  it('usa o segredo local fora de produção', () => {
    expect(resolveInternalApiSecret({ NODE_ENV: 'development' })).toBe(LOCAL_INTERNAL_API_SECRET);
  });

  it('falha em produção sem a variável, sem seguir com o segredo local', () => {
    expect(() => resolveInternalApiSecret({ NODE_ENV: 'production' })).toThrow(
      /INTERNAL_API_SECRET/,
    );
  });
});
