/**
 * SPEC-033 §Conteúdo: fatos da rota que o Flight Watch consegue sustentar.
 * A distância é calculada; o tempo de voo é só uma estimativa e a tela tem
 * de dizer "estimado". Nada aqui afirma que existe voo direto.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;
const FIXED_MINUTES = 30; // táxi, subida e descida
const CRUISE_KM_PER_HOUR = 800;
const ROUND_TO_MINUTES = 5;

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Distância de grande círculo (haversine), em km inteiros. */
export function greatCircleKm(from: Coordinates, to: Coordinates): number {
  const dLat = radians(to.latitude - from.latitude);
  const dLon = radians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a))));
}

/**
 * Tempo de um voo direto hipotético: 30 min fixos mais a distância a
 * 800 km/h, arredondado a 5 min. É estimativa (pergunta aberta da SPEC-033:
 * calibrar com rotas reais). Distância ≤ 0 não é voo.
 */
export function estimateDirectFlightMinutes(distanceKm: number): number | null {
  if (distanceKm <= 0) return null;
  const minutes = FIXED_MINUTES + (distanceKm / CRUISE_KM_PER_HOUR) * 60;
  return Math.round(minutes / ROUND_TO_MINUTES) * ROUND_TO_MINUTES;
}
