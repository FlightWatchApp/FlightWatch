import Link from 'next/link';
import { EmptyState } from '@/components/ui/empty-state';
import { IconArrowDownRight } from '@/components/ui/icon';
import { listOpportunities } from '@/lib/api/opportunities';
import { OpportunitiesClient } from './opportunities-client';
import styles from './page.module.css';

const SORT_OPTIONS = [
  { value: 'best_value', label: 'Melhor valor' },
  { value: 'lowest_price', label: 'Menor preço' },
  { value: 'most_recent', label: 'Mais recente' },
  { value: 'shortest_duration', label: 'Menor duração' },
] as const;

/**
 * SPEC-015/016: feed antigo, a partir dos monitoramentos. SPEC-032 §Rollback:
 * continua no ar enquanto o motor de promoções estiver desligado
 * (`PROMOTION_ENGINE_ENABLED=false`); sai junto com o `Deal`.
 */
export async function LegacyOpportunities({
  sort,
  view,
  origin,
}: {
  sort: string | undefined;
  view: string | undefined;
  origin: string | null;
}) {
  const activeSort = SORT_OPTIONS.some((option) => option.value === sort)
    ? (sort as (typeof SORT_OPTIONS)[number]['value'])
    : 'best_value';
  const base = new URLSearchParams();
  if (origin) base.set('origin', origin);
  if (view === 'map') base.set('view', 'map');

  const opportunities = await listOpportunities({ sort: activeSort });

  function hrefFor(value: string): string {
    const params = new URLSearchParams(base);
    if (value !== 'best_value') params.set('sort', value);
    const query = params.toString();
    return `/opportunities${query ? `?${query}` : ''}`;
  }

  return (
    <>
      <div>
        <p className={styles.eyebrow}>Promoções identificadas pelo sistema</p>
        <h1>Passagens abaixo do padrão agora</h1>
        <p className={styles.subtitle}>
          Rotas em que o preço observado está no menor valor já visto ou bem abaixo da média que o
          sistema calculou a partir do histórico.
        </p>
      </div>

      {opportunities.length > 0 && (
        <div className={styles.toolbar}>
          <span className={styles.toolbarCount}>
            {opportunities.length}{' '}
            {opportunities.length === 1 ? 'promoção encontrada' : 'promoções encontradas'}
          </span>
          <div className={styles.sortLinks}>
            {SORT_OPTIONS.map((option) => (
              <Link
                key={option.value}
                href={hrefFor(option.value)}
                aria-current={activeSort === option.value ? 'true' : undefined}
                className={`${styles.sortLink} ${activeSort === option.value ? styles.sortLinkActive : ''}`}
              >
                {option.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {opportunities.length === 0 && (
        <EmptyState
          icon={<IconArrowDownRight size={32} />}
          title="Nenhuma promoção agora"
          description="Ainda não há histórico suficiente sobre nenhuma rota monitorada para destacar um preço fora do padrão. Volte mais tarde, ou comece um monitoramento em /search."
        />
      )}

      {opportunities.length > 0 && <OpportunitiesClient opportunities={opportunities} />}
    </>
  );
}
