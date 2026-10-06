import type { FlightProvider } from './port.js';
import { SimulatedFlightProvider } from './simulated/simulated-flight-provider.js';

/** Valores aceitos por `FLIGHT_PROVIDER` (SPEC-024). Adapter real entra aqui. */
export type FlightProviderKind = 'simulated';

export function createFlightProvider(kind: FlightProviderKind): FlightProvider {
  switch (kind) {
    case 'simulated':
      return new SimulatedFlightProvider();
  }
}
