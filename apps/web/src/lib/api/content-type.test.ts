import { describe, expect, it } from 'vitest';
import { contentTypeFor } from './content-type';

describe('contentTypeFor (requisição do BFF para a API)', () => {
  // Regressão: POST sem corpo com content-type JSON era recusado pelo Fastify
  // (pausar, reativar, encerrar, sair, reenviar confirmação, clique de compra).
  it('sem corpo não declara JSON', () => {
    expect(contentTypeFor({ method: 'POST' })).toEqual({});
    expect(contentTypeFor({})).toEqual({});
    expect(contentTypeFor({ method: 'POST', body: null })).toEqual({});
  });

  it('com corpo declara JSON', () => {
    expect(contentTypeFor({ method: 'POST', body: '{"a":1}' })).toEqual({
      'content-type': 'application/json',
    });
  });
});
