import Link from 'next/link';
import { cookies } from 'next/headers';
import type { ListPromotionsResponse } from '@flight-watch/contracts';
import { EmptyState } from '@/components/ui/empty-state';
import { IconAlertTriangle, IconArrowDownRight, IconClock, IconRoute } from '@/components/ui/icon';
import { ApiError } from '@/lib/api/client';
import { listPromotions, type PromotionSort } from '@/lib/api/promotions';
import { formatAbsoluteDateTime } from '@/lib/domain/freshness';
import { promotionFeedState, type PromotionFeedResult } from '@/lib/domain/promotion';
import { LegacyOpportunities } from './legacy-opportunities';
import { ORIGIN_COOKIE_NAME, normalizeOriginCode } from './origin';
import { OriginPicker } from './origin-picker';
import { PromotionsClient } from './promotions-client';
import styles from './page.module.css';

const SORT_OPTIONS: { value: PromotionSort; label: string }[] = [
  { value: 'score', label: 'Melhores' },
  { value: 'discount', label: 'Maior diferença' },
  { value: 'price', label: 'Menor preço' },
];

type Feed = { result: PromotionFeedResult; response: ListPromotionsResponse | null };

async function loadFeed(origin: string | null, sort: PromotionSort): Promise<Feed> {
  if (!origin) return { result: { kind: 'no-origin' }, response: null };
  try {
    const response = await listPromotions({ origin, sort });
    return {
      result: { kind: 'feed', status: response.status, count: response.promotions.length },
      response,
    };
  } catch (error) {
    // Origem fora do catálogo: pede outra cidade, sem inventar nenhuma.
    if (error instanceof ApiError && error.code === 'UNSUPPORTED_SEARCH') {
      return { result: { kind: 'no-origin' }, response: null };
    }
    return { result: { kind: 'unavailable' }, response: null };
  }
}

/**
 * SPEC-032: a pessoa escolhe de onde sai e vê as melhores promoções a partir
 * dali. Origem na URL (link compartilhável) ou no cookie de preferência;
 * sem nenhuma das duas, a página pede a cidade. Motor desligado na API
 * (`DISABLED`) volta ao feed da SPEC-015 (rollback).
 */
export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ origin?: string; sort?: string; view?: string }>;
}) {
  const { origin: originParam, sort, view } = await searchParams;
  const cookieStore = await cookies();
  const origin =
    normalizeOriginCode(originParam) ??
    normalizeOriginCode(cookieStore.get(ORIGIN_COOKIE_NAME)?.value);
  const activeSort = SORT_OPTIONS.find((option) => option.value === sort)?.value ?? 'score';

  const { result, response } = await loadFeed(origin, activeSort);
  const state = promotionFeedState(result);

  if (state === 'DISABLED') {
    return (
      <div className={`container ${styles.page}`}>
        <LegacyOpportunities sort={sort} view={view} origin={origin} />
      </div>
    );
  }

  const selectedOrigin = response ? { code: response.origin, name: response.originName } : null;
  const originName = response?.originName ?? '';

  function sortHref(value: PromotionSort): string {
    const params = new URLSearchParams();
    if (response) params.set('origin', response.origin);
    if (value !== 'score') params.set('sort', value);
    if (view === 'map') params.set('view', 'map');
    return `/opportunities?${params.toString()}`;
  }

  return (
    <div className={`container ${styles.page}`}>
      <div>
        <p className={styles.eyebrow}>Promoções identificadas pelo sistema</p>
        <h1>
          {response ? `Promoções saindo de ${originName}` : 'Promoções a partir da sua cidade'}
        </h1>
        <p className={styles.subtitle}>
          Datas em que o menor preço observado pelo sistema está bem abaixo das outras datas
          próximas da mesma rota. Cada cartão mostra a base da comparação e há quanto tempo o preço
          foi encontrado.
        </p>
      </div>

      <OriginPicker key={selectedOrigin?.code ?? 'none'} origin={selectedOrigin} />

      {state === 'NO_ORIGIN' && (
        <EmptyState
          icon={<IconRoute size={32} />}
          title="De onde você sai?"
          description="Escolha a sua cidade de partida para ver as promoções a partir dela."
        />
      )}

      {state === 'UNAVAILABLE' && (
        <EmptyState
          icon={<IconAlertTriangle size={32} />}
          title="Não conseguimos consultar os preços agora"
          description="A fonte de preços não respondeu. Tente de novo em alguns minutos."
        />
      )}

      {state === 'BUDGET_EXHAUSTED' && (
        <EmptyState
          icon={<IconClock size={32} />}
          title="Já consultamos muitas cidades hoje"
          description={`Ainda não calculamos as promoções saindo de ${originName} e o limite diário de consultas à fonte de preços acabou. Volte amanhã ou escolha outra cidade.`}
        />
      )}

      {state === 'EMPTY' && (
        <EmptyState
          icon={<IconArrowDownRight size={32} />}
          title="Nenhuma promoção agora"
          description={`Nenhuma data saindo de ${originName} está bem abaixo das datas próximas da mesma rota neste momento. Isso muda ao longo do dia.`}
          action={<Link href="/search">Buscar uma rota</Link>}
        />
      )}

      {state === 'READY' && response && (
        <>
          <div className={styles.toolbar}>
            <span className={styles.toolbarCount}>
              {response.promotions.length}{' '}
              {response.promotions.length === 1 ? 'promoção' : 'promoções'} · calculado em{' '}
              {formatAbsoluteDateTime(response.generatedAt)}
            </span>
            <div className={styles.sortLinks}>
              {SORT_OPTIONS.map((option) => (
                <Link
                  key={option.value}
                  href={sortHref(option.value)}
                  aria-current={activeSort === option.value ? 'true' : undefined}
                  className={`${styles.sortLink} ${activeSort === option.value ? styles.sortLinkActive : ''}`}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </div>
          <PromotionsClient
            origin={response.origin}
            originName={originName}
            promotions={response.promotions}
            renderedAt={new Date().toISOString()}
          />
        </>
      )}
    </div>
  );
}
