/**
 * SPEC-033: o arco da rota no mapa é o grande círculo (o caminho mais curto
 * na esfera), interpolado em `segments` trechos — como na referência visual.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function greatCirclePath(from: LatLng, to: LatLng, segments: number): [number, number][] {
  const lat1 = toRad(from.latitude);
  const lon1 = toRad(from.longitude);
  const lat2 = toRad(to.latitude);
  const lon2 = toRad(to.longitude);
  const angle =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
      ),
    );
  if (angle === 0) {
    return Array.from({ length: segments + 1 }, () => [from.latitude, from.longitude]);
  }
  return Array.from({ length: segments + 1 }, (_, index) => {
    const f = index / segments;
    const a = Math.sin((1 - f) * angle) / Math.sin(angle);
    const b = Math.sin(f * angle) / Math.sin(angle);
    const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);
    return [toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), toDeg(Math.atan2(y, x))];
  });
}
