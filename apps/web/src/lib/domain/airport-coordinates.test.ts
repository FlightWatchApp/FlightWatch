import { describe, expect, it } from 'vitest';
import { airportCity, airportLabel } from './airport-coordinates.js';

describe('airportCity', () => {
  it('returns only the city, without the IATA code', () => {
    expect(airportCity('GRU')).toBe('São Paulo/Guarulhos');
    expect(airportCity('JFK')).toBe('Nova York/JFK');
  });

  it('returns null for an unknown code', () => {
    expect(airportCity('XXX')).toBeNull();
  });
});

describe('airportLabel', () => {
  it('formats as "CODE · City"', () => {
    expect(airportLabel('GRU')).toBe('GRU · São Paulo/Guarulhos');
  });

  it('returns the code itself for an unknown airport', () => {
    expect(airportLabel('XXX')).toBe('XXX');
  });
});
