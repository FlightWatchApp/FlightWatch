import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/api/auth';
import { getMeOverview } from '@/lib/api/me';
import { searchPlaces } from '@/lib/api/places';
import { quotaLabel } from '@/lib/domain/watch-quota';
import { parseWatchPrefill } from '@/lib/domain/trip-prefill';
import { readSessionToken } from '@/lib/auth/session';
import type { SelectedPlace } from '@/components/places/place-options';
import { NewWatchForm } from './new-watch-form';

/** SPEC-045: nome da cidade pelo código; falhou ou não achou = a pessoa escolhe na lista. */
async function resolveCity(code: string | null): Promise<SelectedPlace | null> {
  if (!code) return null;
  try {
    const places = await searchPlaces(code, 8);
    const city = places.find((place) => place.code === code);
    return city ? { code: city.code, name: city.name } : null;
  } catch {
    return null;
  }
}

/**
 * Checagem de presença do cookie só — UX (evita renderizar o formulário e só
 * então redirecionar), não o limite de segurança real, que continua sendo o
 * SessionAuthGuard em apps/api validando o token contra o banco.
 */
export default async function NewWatchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const token = await readSessionToken();
  if (!token) {
    redirect('/login');
  }

  const user = await getCurrentUser().catch(() => null);
  const overview = await getMeOverview().catch(() => null);
  // SPEC-045: "Monitorar esta viagem" da busca traz rota e datas pela URL.
  const prefill = parseWatchPrefill(await searchParams);
  const [prefillOrigin, prefillDestination] = await Promise.all([
    resolveCity(prefill.origin),
    resolveCity(prefill.destination),
  ]);
  return (
    <NewWatchForm
      initialOrigin={prefillOrigin ?? user?.homeCity ?? null}
      initialDestination={prefillDestination}
      initialTripType={prefill.tripType}
      initialDepartureDate={prefill.departureDate}
      initialReturnDate={prefill.returnDate}
      quota={overview ? quotaLabel(overview.watchQuota) : null}
    />
  );
}
