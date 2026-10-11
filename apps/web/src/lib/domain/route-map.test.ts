import { describe, expect, it } from 'vitest';
import { greatCirclePath } from './route-map';

const SAO = { latitude: -23.55, longitude: -46.63 };
const LIS = { latitude: 38.72, longitude: -9.14 };

describe('greatCirclePath (mapa da SPEC-033)', () => {
  it('começa na origem, termina no destino, com a quantidade de pontos pedida', () => {
    const path = greatCirclePath(SAO, LIS, 32);
    expect(path).toHaveLength(33);
    expect(path[0]?.[0]).toBeCloseTo(SAO.latitude, 6);
    expect(path[0]?.[1]).toBeCloseTo(SAO.longitude, 6);
    expect(path[32]?.[0]).toBeCloseTo(LIS.latitude, 6);
    expect(path[32]?.[1]).toBeCloseTo(LIS.longitude, 6);
  });

  it('o meio do arco fica entre as pontas (sem dar a volta no globo)', () => {
    const [lat, lng] = greatCirclePath(SAO, LIS, 2)[1] ?? [0, 0];
    expect(lat).toBeGreaterThan(SAO.latitude);
    expect(lat).toBeLessThan(LIS.latitude);
    expect(lng).toBeGreaterThan(SAO.longitude);
    expect(lng).toBeLessThan(LIS.longitude);
  });

  it('mesmo ponto vira um ponto só repetido, sem NaN', () => {
    const path = greatCirclePath(SAO, SAO, 4);
    expect(path.every(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng))).toBe(true);
  });
});
