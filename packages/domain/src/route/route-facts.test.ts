import { describe, expect, it } from 'vitest';
import { estimateDirectFlightMinutes, greatCircleKm } from './route-facts.js';

const SAO = { latitude: -23.55, longitude: -46.63 };
const RIO = { latitude: -22.91, longitude: -43.17 };
const LIS = { latitude: 38.72, longitude: -9.14 };
const DOU = { latitude: -22.2, longitude: -54.8 };

describe('greatCircleKm (SPEC-033 AC-3)', () => {
  it('bate com distâncias conhecidas, em km inteiros', () => {
    const rio = greatCircleKm(SAO, RIO);
    const lis = greatCircleKm(SAO, LIS);

    expect(Number.isInteger(rio)).toBe(true);
    // Referências públicas: ~360 km e ~7.900 km (tolerância de 2%).
    expect(rio).toBeGreaterThan(350);
    expect(rio).toBeLessThan(367);
    expect(lis).toBeGreaterThan(7750);
    expect(lis).toBeLessThan(8070);
  });

  it('é simétrica', () => {
    expect(greatCircleKm(SAO, DOU)).toBe(greatCircleKm(DOU, SAO));
  });

  it('mesmo ponto dá 0', () => {
    expect(greatCircleKm(SAO, SAO)).toBe(0);
  });

  it('atravessa o antimeridiano pelo caminho curto', () => {
    // 2° de longitude no equador ≈ 222 km, não ~39.800 km pelo outro lado.
    const km = greatCircleKm({ latitude: 0, longitude: 179 }, { latitude: 0, longitude: -179 });
    expect(km).toBeGreaterThan(220);
    expect(km).toBeLessThan(225);
  });
});

describe('estimateDirectFlightMinutes (SPEC-033 AC-3)', () => {
  it('30 min fixos mais a distância a 800 km/h, arredondado a 5 min', () => {
    // 875 km → 30 + 65,6 = 95,6 → 95.
    expect(estimateDirectFlightMinutes(875)).toBe(95);
    // 400 km → 30 + 30 = 60.
    expect(estimateDirectFlightMinutes(400)).toBe(60);
    // 7.900 km → 30 + 592,5 = 622,5 → 625.
    expect(estimateDirectFlightMinutes(7900)).toBe(625);
  });

  it('distância zero ou negativa não vira voo', () => {
    expect(estimateDirectFlightMinutes(0)).toBeNull();
    expect(estimateDirectFlightMinutes(-10)).toBeNull();
  });
});
