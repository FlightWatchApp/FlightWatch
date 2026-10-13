import { describe, expect, it } from 'vitest';
import { matchesVisitorCity, visitorCityFromHeaders } from './visitor-city';

function headers(values: Record<string, string>) {
  return (name: string) => values[name] ?? null;
}

describe('visitorCityFromHeaders (SPEC-034, cabeçalhos da Cloudflare)', () => {
  it('lê a cidade quando o país é o Brasil', () => {
    expect(
      visitorCityFromHeaders(headers({ 'cf-ipcountry': 'BR', 'cf-ipcity': 'Campo Grande' })),
    ).toBe('Campo Grande');
  });

  it('decodifica nome com acento enviado codificado', () => {
    expect(
      visitorCityFromHeaders(headers({ 'cf-ipcountry': 'br', 'cf-ipcity': 'S%C3%A3o%20Paulo' })),
    ).toBe('São Paulo');
  });

  it('sem Cloudflare, fora do Brasil ou valor estranho: nada', () => {
    expect(visitorCityFromHeaders(headers({}))).toBeNull();
    expect(
      visitorCityFromHeaders(headers({ 'cf-ipcountry': 'PT', 'cf-ipcity': 'Lisbon' })),
    ).toBeNull();
    expect(visitorCityFromHeaders(headers({ 'cf-ipcountry': 'BR', 'cf-ipcity': 'x' }))).toBeNull();
    expect(visitorCityFromHeaders(headers({ 'cf-ipcountry': 'BR', 'cf-ipcity': '%E0%A4%A' }))).toBe(
      '%E0%A4%A',
    );
  });
});

describe('matchesVisitorCity', () => {
  it('compara sem acento e sem diferença de caixa', () => {
    expect(matchesVisitorCity('São Paulo', 'sao paulo')).toBe(true);
    expect(matchesVisitorCity('Campo Grande', 'Campo Grande')).toBe(true);
    expect(matchesVisitorCity('Campo Grande', 'Campos')).toBe(false);
  });
});
