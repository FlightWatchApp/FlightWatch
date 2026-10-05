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
 * SPEC-015/016: página pública — sem checagem de sessão, mesmo padrão de
 * apps/web/src/app/search/page.tsx (SPEC-014). Ordenação é link puro (sem
 * JS): continua funcional sem JavaScript. O toggle Lista/Mapa e a seleção
 * de marcador (SPEC-016) exigem estado do cliente — delegados a
 * `OpportunitiesClient`; esta página em si só busca o dado.
 */
export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; view?: string }>;
}) {
  const { sort, view } = await searchParams;
  const activeSort = SORT_OPTIONS.some((option) => option.value === sort)
    ? (sort as (typeof SORT_OPTIONS)[number]['value'])
    : 'best_value';
  const viewQuery = view === 'map' ? '&view=map' : '';

  const opportunities = await listOpportunities({ sort: activeSort });

  return (
    <div className={`container ${styles.page}`}>
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
                href={
                  option.value === 'best_value'
                    ? `/opportunities${viewQuery ? `?${viewQuery.slice(1)}` : ''}`
                    : `/opportunities?sort=${option.value}${viewQuery}`
                }
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
    </div>
  );
}
