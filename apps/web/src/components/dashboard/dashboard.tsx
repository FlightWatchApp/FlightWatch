import Link from 'next/link';
import { DealCard } from '@/components/deals/deal-card';
import { PurchaseNote } from '@/components/purchase/purchase-note';
import { EmptyState } from '@/components/ui/empty-state';
import { IconBell, IconSearch } from '@/components/ui/icon';
import { WatchCard } from '@/components/watches/watch-card';
import { WatchHighlight } from '@/components/watches/watch-highlight';
import { CreateWatchModal } from '@/components/watches/create-watch-modal';
import type { OpportunityItem, WatchDetail, WatchSummary } from '@/lib/api/types';
import { formatMoney } from '@/lib/domain/money';
import styles from './dashboard.module.css';

export interface DashboardStats {
  monitoredCount: number;
  targetReachedCount: number;
  currentOfferCount: number;
}

export interface DashboardProps {
  userEmail: string;
  highlight: WatchDetail | null;
  promotions: OpportunityItem[];
  monitoring: WatchSummary[];
  stats: DashboardStats;
}

function firstNameFromEmail(email: string): string {
  const localPart = email.split('@')[0] ?? '';
  const firstName = localPart.split(/[._-]/)[0] ?? '';
  return firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : 'você';
}

function formatCount(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

export function Dashboard({ userEmail, highlight, promotions, monitoring, stats }: DashboardProps) {
  const targetLabel = formatCount(stats.targetReachedCount, 'meta atingida', 'metas atingidas');
  const targetDistance =
    highlight?.currentPrice && highlight.targetAmountMinor !== null
      ? Math.abs(highlight.targetAmountMinor - highlight.currentPrice.amountMinor)
      : null;
  const targetDirection =
    highlight?.currentPrice && highlight.targetAmountMinor !== null
      ? highlight.currentPrice.amountMinor <= highlight.targetAmountMinor
        ? 'abaixo'
        : 'acima'
      : null;

  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>Painel de voo</p>
          <h1>Olá, {firstNameFromEmail(userEmail)}</h1>
          <p className={styles.subtitle}>
            Acompanhe suas rotas e veja quando o preço estiver pronto para agir.
          </p>
        </div>
        <Link href="/search" className={styles.searchLink}>
          <IconSearch size={17} />
          Buscar passagem
        </Link>
      </header>

      {highlight ? (
        <WatchHighlight watch={highlight} />
      ) : (
        <section className={styles.emptyHighlight} aria-labelledby="empty-highlight-title">
          <div>
            <p className={styles.eyebrow}>Seu próximo voo</p>
            <h2 id="empty-highlight-title">Comece a observar uma rota</h2>
            <p>
              Crie um monitoramento e o Flight Watch acompanha o preço até encontrar um bom momento
              para comprar.
            </p>
          </div>
          <CreateWatchModal triggerClassName={styles.emptyAction} />
        </section>
      )}

      <div className={styles.contentGrid}>
        <div className={styles.mainColumn}>
          <section className={styles.section} aria-labelledby="promotions-title">
            <div className={styles.sectionHead}>
              <div>
                <p className={styles.sectionKicker}>Oportunidades para você</p>
                <h2 id="promotions-title">Promoções nos seus destinos</h2>
              </div>
              <Link href="/opportunities" className={styles.sectionLink}>
                Ver todas
              </Link>
            </div>

            {promotions.length > 0 ? (
              <>
                <ul className={styles.list}>
                  {promotions.map((opportunity) => (
                    <li key={opportunity.searchTargetId}>
                      <DealCard opportunity={opportunity} compact />
                    </li>
                  ))}
                </ul>
                <PurchaseNote />
              </>
            ) : (
              <p className={styles.muted}>
                Ainda não encontramos uma promoção nas rotas que você monitora.
              </p>
            )}
          </section>

          <section className={styles.section} aria-labelledby="monitoring-title">
            <div className={styles.sectionHead}>
              <div>
                <p className={styles.sectionKicker}>Rotas sob observação</p>
                <h2 id="monitoring-title">Todos os seus monitoramentos</h2>
              </div>
              <span className={styles.count}>{targetLabel}</span>
            </div>

            {monitoring.length > 0 ? (
              <>
                <ul className={styles.list}>
                  {monitoring.map((watch) => (
                    <li key={watch.id}>
                      <WatchCard watch={watch} />
                    </li>
                  ))}
                </ul>
                {monitoring.some((watch) => watch.currentOffer) && <PurchaseNote />}
              </>
            ) : (
              <EmptyState
                icon={<IconBell size={28} />}
                title="Nenhum monitoramento ainda"
                description="Escolha uma rota para começar a receber alertas quando o preço mudar."
                action={
                  <CreateWatchModal
                    label="Criar meu primeiro monitoramento"
                    triggerClassName={styles.emptyAction}
                  />
                }
              />
            )}
          </section>
        </div>

        <aside className={styles.sidebar} aria-label="Resumo da sua conta">
          <section className={styles.statsPanel}>
            <p className={styles.sectionKicker}>Agora</p>
            <h2>Seu resumo</h2>
            <dl className={styles.statsGrid}>
              <div className={styles.stat}>
                <dt>Rotas monitoradas</dt>
                <dd>{stats.monitoredCount}</dd>
              </div>
              <div className={styles.stat}>
                <dt>Metas atingidas</dt>
                <dd>{stats.targetReachedCount}</dd>
              </div>
              <div className={styles.stat}>
                <dt>Ofertas atuais</dt>
                <dd>{stats.currentOfferCount}</dd>
              </div>
            </dl>
          </section>

          <section className={styles.ctaPanel}>
            <p className={styles.sectionKicker}>Tem outro destino em mente?</p>
            <h2>Compare uma nova rota</h2>
            <p>Pesquise preços e escolha o que vale a pena acompanhar.</p>
            <Link href="/search" className={styles.ctaLink}>
              <IconSearch size={17} />
              Buscar passagem
            </Link>
          </section>

          {highlight?.currentPrice && targetDistance !== null && targetDirection && (
            <p className={styles.targetNote}>
              Seu destaque está{' '}
              <strong>
                {formatMoney({
                  amountMinor: targetDistance,
                  currency: highlight.currentPrice.currency,
                })}
              </strong>{' '}
              {targetDirection} do preço desejado.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
