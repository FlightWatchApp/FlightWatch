import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { EmailVerificationBanner } from '@/components/account/email-verification-banner';
import { loadHomePromotions, loadShowcase } from '@/components/home/hero-promotion';
import { Landing } from '@/components/home/landing';
import { MemberHome } from '@/components/home/member-home';
import { getCurrentUser } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { searchPlaces } from '@/lib/api/places';
import { getMeOverview } from '@/lib/api/me';
import { listWatches } from '@/lib/api/watches';
import { matchesVisitorCity, visitorCityFromHeaders } from '@/lib/domain/visitor-city';
import { ORIGIN_COOKIE_NAME, normalizeOriginCode } from './opportunities/origin';
import { routePagesEnabled } from '@/lib/domain/route-flag';
import { isBelowTypicalPrice } from '@/lib/domain/watch-price';

/** Cartões de promoção na home de quem está logado. */
const MEMBER_PROMOTIONS = 3;

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
  // SPEC-032/034: a origem é a escolhida (cookie) ou, sem ela, a sugerida
  // pelo acesso; a vitrine das cidades mais usadas vem sempre junto. Vale
  // para visitante e para quem está logado.
  const cookieStore = await cookies();
  // SPEC-040: sem escolha neste navegador, vale a cidade da conta.
  const chosen =
    normalizeOriginCode(cookieStore.get(ORIGIN_COOKIE_NAME)?.value) ?? user?.homeCity?.code ?? null;
  const suggestion = chosen ? null : await suggestedOrigin();
  const origin = chosen ?? suggestion?.code ?? null;
  const [promotions, showcase] = await Promise.all([loadHomePromotions(origin), loadShowcase()]);

  if (!user) {
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
  // Promoções da cidade primeiro; depois a vitrine, sem repetir destino.
  const fromOrigin = promotions
    ? [promotions.hero.promotion, ...promotions.more].map((promotion) => ({
        origin: promotions.hero.origin,
        originName: promotions.hero.originName,
        promotion,
      }))
    : [];
  const shown = new Set(fromOrigin.map((item) => item.promotion.destination));
  const fromShowcase = showcase
    .filter((promotion) => !shown.has(promotion.destination))
    .map((promotion) => ({
      origin: promotion.origin,
      originName: promotion.originName,
      promotion,
    }));
  const memberPromotions = [...fromOrigin, ...fromShowcase].slice(0, MEMBER_PROMOTIONS);
  // SPEC-040: painéis pessoais; falha deixa a home sem eles.
  const overview = await getMeOverview().catch(() => null);

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
        promotions={memberPromotions}
        overview={overview}
        originName={promotions?.hero.originName ?? null}
        offerPages={routePagesEnabled()}
        renderedAt={new Date().toISOString()}
        monitoredCount={active.length}
        belowTypicalCount={belowTypical}
        currentOfferCount={active.filter((watch) => watch.currentOffer !== null).length}
      />
    </>
  );
}
