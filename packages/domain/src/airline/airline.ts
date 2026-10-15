/** SPEC-038: companhia aérea do catálogo (código IATA de 2 caracteres e nome). */
export interface AirlineRecord {
  code: string;
  name: string;
}

const AIRLINE_CODE = /^[A-Z0-9]{2}$/;

export function isAirlineCode(value: string): boolean {
  return AIRLINE_CODE.test(value);
}
