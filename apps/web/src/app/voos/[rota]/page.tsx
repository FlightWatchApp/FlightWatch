import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import type { GetRouteResponse } from '@flight-watch/contracts';
import { RouteMapLoader } from '@/components/route/route-map-loader';
import { RoutePrices } from '@/components/route/route-prices';
import styles from '@/components/route/route-page.module.css';
import { ApiError } from '@/lib/api/client';
import { getRoute } from '@/lib/api/routes';
import { routePagesEnabled } from '@/lib/domain/route-flag';
import {
  formatDistanceKm,
  formatEstimatedDuration,
  routeIndexable,
  routeMetaDescription,
  routeTitle,
} from '@/lib/domain/route-page';
import { parseRouteSegment, routePath, routeSegment } from '@/lib/domain/route-url';

type Params = { params: Promise<{ rota: string }> };

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? 'http://localhost:3100';

/** Rota da URL → resposta da API; null quando a página não existe (404). */
async function loadRoute(segment: string): Promise<GetRouteResponse | null> {
  if (!routePagesEnabled()) return null;
  const parsed = parseRouteSegment(segment);
  if (!parsed) return null;
  try {
    return await getRoute(parsed.originCode, parsed.destinationCode);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { rota } = await params;
  const route = await loadRoute(rota);
  if (!route) return { robots: { index: false, follow: false } };
  const { origin, destination, prices } = route;
  const canonical = routePath(origin, destination);
  return {
    title: routeTitle(origin.name, destination.name),
    description: routeMetaDescription(
      origin.name,
      destination.name,
      prices.cheapest ? { ...prices.cheapest, currency: prices.currency } : null,
    ),
    alternates: { canonical },
    // SPEC-033 §Indexação: página sem nenhum preço não vai para o Google.
    robots: routeIndexable(prices.days.length)
      ? { index: true, follow: true }
      : { index: false, follow: true },
  };
}

/**
 * SPEC-033: página da rota, por par de cidades. A URL canônica é por cidade
 * (`/voos/sao-paulo-sao-para-dourados-dou`); código de aeroporto ou slug
 * diferente → 308 para ela.
 */
export default async function RoutePage({ params }: Params) {
  const { rota } = await params;
  const route = await loadRoute(rota);
  if (!route) notFound();

  const { origin, destination } = route;
  const canonical = routeSegment(origin, destination);
  if (rota !== canonical) permanentRedirect(`/voos/${canonical}`);

  const renderedAt = new Date().toISOString();
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Início', item: `${WEB_BASE_URL}/` },
      {
        '@type': 'ListItem',
        position: 2,
        name: `Passagens de ${origin.name} para ${destination.name}`,
        item: `${WEB_BASE_URL}${routePath(origin, destination)}`,
      },
    ],
  };

  return (
    <div className={`container ${styles.page}`}>
      <script
        type="application/ld+json"
        // JSON-LD do breadcrumb (SPEC-033 §SEO); conteúdo gerado aqui, sem entrada externa crua.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb).replace(/</g, '\\u003c') }}
      />
      <nav aria-label="Caminho" className={styles.breadcrumb}>
        <Link href="/" prefetch={false}>
          Início
        </Link>{' '}
        <span aria-hidden="true">›</span> <span>Voos de {origin.name}</span>{' '}
        <span aria-hidden="true">›</span> <span aria-current="page">para {destination.name}</span>
      </nav>

      <header className={styles.header}>
        <h1>{routeTitle(origin.name, destination.name)}</h1>
        <p className={styles.subtitle}>
          Ver também:{' '}
          <Link href={routePath(destination, origin)} prefetch={false}>
            {destination.name} → {origin.name}
          </Link>
        </p>
      </header>

      <div className={styles.top}>
        <section className={styles.places} aria-label="Rota">
          {[origin, destination].map((place, index) => (
            <div key={place.code} className={styles.place}>
              <p className={styles.placeRole}>{index === 0 ? 'Saindo de' : 'Chegando em'}</p>
              <p className={styles.placeName}>
                {place.name} <span className="iata">{place.code}</span>
              </p>
              <p className={styles.placeMeta}>{place.countryName}</p>
              {place.airports.length > 0 && (
                <p className={styles.placeMeta}>
                  Aeroportos: {place.airports.map((airport) => airport.code).join(' · ')}
                </p>
              )}
            </div>
          ))}
        </section>
        {origin.coordinates && destination.coordinates && (
          <RouteMapLoader
            origin={{ ...origin.coordinates, code: origin.code, name: origin.name }}
            destination={{
              ...destination.coordinates,
              code: destination.code,
              name: destination.name,
            }}
          />
        )}
      </div>

      <RoutePrices route={route} renderedAt={renderedAt} />

      <section className={styles.facts} aria-labelledby="route-facts">
        <h2 id="route-facts" className={styles.sectionTitle}>
          Sobre a rota
        </h2>
        <dl>
          {route.distanceKm !== null && (
            <div>
              <dt>Distância</dt>
              <dd>{formatDistanceKm(route.distanceKm)} (calculada entre as cidades)</dd>
            </div>
          )}
          {route.estimatedDirectFlightMinutes !== null && (
            <div>
              <dt>Tempo de voo direto</dt>
              <dd>{formatEstimatedDuration(route.estimatedDirectFlightMinutes)}</dd>
            </div>
          )}
          {[origin, destination].map((place) =>
            place.airports.length > 0 ? (
              <div key={place.code}>
                <dt>Aeroportos de {place.name}</dt>
                <dd>
                  {place.airports.map((airport) => `${airport.name} (${airport.code})`).join(', ')}
                </dd>
              </div>
            ) : null,
          )}
        </dl>
        <p className={styles.factsNote}>
          Distância e tempo são calculados a partir da posição das cidades; a duração de cada voo
          depende da companhia e das escalas.
        </p>
      </section>
    </div>
  );
}
