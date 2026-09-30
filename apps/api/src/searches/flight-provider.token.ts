/**
 * `FlightProvider` (packages/providers) é uma interface, não uma classe —
 * NestJS precisa de um token de injeção separado pra prover uma implementação
 * por trás dela (mesmo padrão de EMAIL_SENDER em apps/api/src/auth/).
 */
export const FLIGHT_PROVIDER = Symbol('FLIGHT_PROVIDER');
