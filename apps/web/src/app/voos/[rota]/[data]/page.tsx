import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import type { GetRouteOfferResponse } from '@flight-watch/contracts';
import { OfferHighlight } from '@/components/offer/offer-highlight';
import layout from '@/components/offer/offer-layout.module.css';
import { PersonalPanels } from '@/components/personal/personal-panels';
import styles from '@/components/route/route-page.module.css';
import { EmptyState } from '@/components/ui/empty-state';
import { IconAlertTriangle, IconClock, IconRoute } from '@/components/ui/icon';
import { ApiError } from '@/lib/api/client';
import { getCurrentUser } from '@/lib/api/auth';
import { getMeOverview } from '@/lib/api/me';
import { getRouteOffer } from '@/lib/api/routes';
import { formatDate } from '@/lib/domain/freshness';
import { isOfferDate } from '@/lib/domain/offer';
import { routePagesEnabled } from '@/lib/domain/route-flag';
import { parseRouteSegment, routePath, routeSegment } from '@/lib/domain/route-url';

type Params = { params: Promise<{ rota: string; data: string }> };

/** Rota e data da URL → resposta da API; null quando a página não existe (404). */
async function loadOffer(segment: string, date: string): Promise<GetRouteOfferResponse | null> {
  if (!routePagesEnabled() || !isOfferDate(date)) return null;
  const parsed = parseRouteSegment(segment);
  if (!parsed) return null;
  try {
    return await getRouteOffer(parsed.originCode, parsed.destinationCode, date);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { rota, data } = await params;
  const offer = await loadOffer(rota, data);
  if (!offer) return { robots: { index: false, follow: false } };
  return {
    title: `${offer.origin.name} para ${offer.destination.name} em ${formatDate(offer.date)}`,
    description: `Preço observado pelo sistema para ${offer.origin.name} → ${offer.destination.name} em ${formatDate(offer.date)}, com a companhia e o horário do voo mais barato que encontramos.`,
    // SPEC-038 §SEO: uma página por data seria conteúdo repetido — fica fora do índice.
    alternates: { canonical: routePath(offer.origin, offer.destination) },
    robots: { index: false, follow: true },
  };
}

/**
 * SPEC-038: página "Ver oferta" — o preço de um dia, o voo mais barato que a
 * fonte viu nele e as datas próximas. Só ida; slug diferente do canônico → 308.
 */
export default async function OfferPage({ params }: Params) {
  const { rota, data } = await params;
  const offer = await loadOffer(rota, data);
  if (!offer) notFound();

  const canonical = routeSegment(offer.origin, offer.destination);
  if (rota !== canonical) permanentRedirect(`/voos/${canonical}/${offer.date}`);

  const routeHref = routePath(offer.origin, offer.destination);
  const renderedAt = new Date().toISOString();
  const { price } = offer;
  // SPEC-040: painéis pessoais só com sessão; falha deixa a oferta sozinha.
  const user = await getCurrentUser();
  const overview = user ? await getMeOverview().catch(() => null) : null;

  return (
    <div className={`container ${styles.page}`}>
      <nav aria-label="Trilha" className={styles.breadcrumb}>
        <Link href="/">Início</Link> ›{' '}
        <Link href={routeHref}>
          {offer.origin.name} para {offer.destination.name}
        </Link>{' '}
        › <span aria-current="page">{formatDate(offer.date)}</span>
      </nav>

      <div className={overview ? layout.withPanels : layout.main}>
        <div className={layout.main}>
          {price ? (
            <OfferHighlight
              offer={{ ...offer, price }}
              routeHref={routeHref}
              renderedAt={renderedAt}
            />
          ) : (
            <>
              <div className={styles.header}>
                <h1>
                  {offer.origin.name} para {offer.destination.name} em {formatDate(offer.date)}
                </h1>
              </div>
              {offer.status === 'NO_PRICE' && (
                <EmptyState
                  icon={<IconRoute size={32} />}
                  title="Não temos preço para este dia"
                  description="A fonte de preços não tem esta data agora. Veja as outras datas da rota."
                  action={<Link href={routeHref}>Ver todas as datas</Link>}
                />
              )}
              {offer.status === 'UPDATING' && (
                <EmptyState
                  icon={<IconClock size={32} />}
                  title="Ainda atualizando os preços"
                  description="Já consultamos muitas rotas hoje. Volte em alguns minutos ou veja as outras datas."
                  action={<Link href={routeHref}>Ver todas as datas</Link>}
                />
              )}
              {offer.status === 'UNAVAILABLE' && (
                <EmptyState
                  icon={<IconAlertTriangle size={32} />}
                  title="Não conseguimos consultar os preços agora"
                  description="A fonte de preços não respondeu. Tente de novo em alguns minutos."
                  action={<Link href={routeHref}>Ver a rota</Link>}
                />
              )}
            </>
          )}
        </div>
        {overview && <PersonalPanels overview={overview} offerPages layout="aside" />}
      </div>
    </div>
  );
}
