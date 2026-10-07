import type { FlightProvider } from './port.js';
import { SimulatedFlightProvider } from './simulated/simulated-flight-provider.js';
import { TravelpayoutsFlightProvider } from './travelpayouts/flight-provider.js';

/** Valores aceitos por `FLIGHT_PROVIDER` (SPEC-024/030). Adapter novo entra aqui. */
export type FlightProviderKind = 'simulated' | 'travelpayouts';

export interface FlightProviderSettings {
  kind: FlightProviderKind;
  /** Obrigatório com `travelpayouts` — a config já garante (SPEC-030 AC-8). */
  travelpayoutsToken?: string | undefined;
  timeoutMs: number;
}

export function createFlightProvider(settings: FlightProviderSettings): FlightProvider {
  switch (settings.kind) {
    case 'simulated':
      return new SimulatedFlightProvider();
    case 'travelpayouts':
      if (!settings.travelpayoutsToken) {
        throw new Error('createFlightProvider: travelpayouts requires a token');
      }
      return new TravelpayoutsFlightProvider({
        token: settings.travelpayoutsToken,
        timeoutMs: settings.timeoutMs,
      });
  }
}
