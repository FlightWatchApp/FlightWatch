import { describe, expect, it } from 'vitest';
import { resolveCorrelationId } from './correlation.js';

describe('resolveCorrelationId', () => {
  it('returns the header value when it is present and valid', () => {
    expect(resolveCorrelationId('client-id-123')).toBe('client-id-123');
  });

  it('generates a new id when the header is absent', () => {
    expect(resolveCorrelationId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('generates a new id when the header is an empty string', () => {
    expect(resolveCorrelationId('')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('generates a new id when the header is longer than 128 characters', () => {
    const tooLong = 'a'.repeat(200);
    const result = resolveCorrelationId(tooLong);
    expect(result).not.toBe(tooLong);
    expect(result).toMatch(/^[0-9a-f-]{36}$/);
  });

  // SPEC-013 §5: nunca refletir texto com caractere de controle no header de
  // resposta — inclusive CRLF, que poderia ser usado pra injetar um header
  // extra numa resposta que confiasse cegamente no valor de entrada.
  it('generates a new id when the header contains a control character', () => {
    const result = resolveCorrelationId('id-with-\r\ninjected-header: evil');
    expect(result).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('uses the first value when the header is repeated', () => {
    expect(resolveCorrelationId(['first-id', 'second-id'])).toBe('first-id');
  });
});
