import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { EmailVerificationBanner } from '@/components/account/email-verification-banner';
import { loadHomePromotions, loadShowcase } from '@/components/home/hero-promotion';
import { Landing } from '@/components/home/landing';
import { MemberHome } from '@/components/home/member-home';
import { getCurrentUser } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { listOpportunities } from '@/lib/api/opportunities';
import { searchPlaces } from '@/lib/api/places';
import type { OpportunityItem } from '@/lib/api/types';
import { listWatches } from '@/lib/api/watches';
import { matchesVisitorCity, visitorCityFromHeaders } from '@/lib/domain/visitor-city';
import { ORIGIN_COOKIE_NAME, normalizeOriginCode } from './opportunities/origin';
import { isBelowTypicalPrice } from '@/lib/domain/watch-price';

/** PG-01/PG-02: promoções são um complemento da home — se o feed falhar, a página continua. */
async function safeOpportunities(): Promise<OpportunityItem[]> {
  try {
    return await listOpportunities({ sort: 'best_value' });
  } catch {
    return [];
  }
}

/**
 * SPEC-034: cidade sugerida pelo acesso (cabeçalhos da Cloudflare), procurada
 * no catálogo. Nada é gravado; sem Cloudflare ou sem correspondência, null.
 */
async function suggestedOrigin(): Promise<{ code: string; name: string } | null> {
  const incoming = await headers();
  const city = visitorCityFromHeaders((name) => incoming.get(name));
  if (!city) return null;
  try {
    const places = await searchPlaces(city, 5);
    const match = places.find(
      (place) => place.countryCode === 'BR' && matchesVisitorCity(place.name, city),
    );
    return match ? { code: match.code, name: match.name } : null;
  } catch {
    return null;
  }
}

/**
 * Visitante: landing com promoções ao vivo (PG-01). Com sessão: início
 * institucional do app; os monitoramentos ficam em `/watches`.
 */
export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) {
    // SPEC-032/034: a origem é a escolhida (cookie) ou, sem ela, a sugerida
    // pelo acesso; a vitrine das cidades mais usadas vem sempre junto.
    const cookieStore = await cookies();
    const chosen = normalizeOriginCode(cookieStore.get(ORIGIN_COOKIE_NAME)?.value);
    const suggestion = chosen ? null : await suggestedOrigin();
    const origin = chosen ?? suggestion?.code ?? null;
    const [promotions, showcase] = await Promise.all([loadHomePromotions(origin), loadShowcase()]);
    return (
      <Landing
        heroPromotion={promotions?.hero ?? null}
        morePromotions={promotions?.more ?? []}
        heroOriginChosen={origin !== null}
        originSuggestion={suggestion}
        showcase={showcase}
      />
    );
  }

  let watches;
  try {
    watches = await listWatches();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }
    throw error;
  }
  const opportunities = await safeOpportunities();

  const active = watches.filter((watch) => watch.status === 'ACTIVE' || watch.status === 'PAUSED');
  const belowTypical = watches.filter(
    (watch) => watch.status === 'ACTIVE' && isBelowTypicalPrice(watch),
  ).length;

  return (
    <>
      {!user.notificationChannelVerified && (
        <div className="container">
          <EmailVerificationBanner />
        </div>
      )}
      <MemberHome
        userEmail={user.email}
        notificationChannelVerified={user.notificationChannelVerified}
        opportunities={opportunities}
        monitoredCount={active.length}
        belowTypicalCount={belowTypical}
        currentOfferCount={active.filter((watch) => watch.currentOffer !== null).length}
      />
    </>
  );
}
