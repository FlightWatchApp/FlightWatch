import type { CSSProperties } from 'react';
import Link from 'next/link';
import { DealCard } from '@/components/deals/deal-card';
import { PurchaseNote } from '@/components/purchase/purchase-note';
import buttonStyles from '@/components/ui/button.module.css';
import {
  IconBell,
  IconCheckCircle,
  IconExternalLink,
  IconSearch,
  IconShield,
  IconUser,
} from '@/components/ui/icon';
import type { OpportunityItem } from '@/lib/api/types';
import styles from './member-home.module.css';

const primaryLg = [buttonStyles.button, buttonStyles.primary, buttonStyles.lg].join(' ');
const secondaryLg = [buttonStyles.button, buttonStyles.secondary, buttonStyles.lg].join(' ');

export interface MemberHomeProps {
  userEmail: string;
  notificationChannelVerified: boolean;
  opportunities: OpportunityItem[];
  monitoredCount: number;
  targetReachedCount: number;
  currentOfferCount: number;
}

function firstNameFromEmail(email: string): string {
  const localPart = email.split('@')[0] ?? '';
  const firstName = localPart.split(/[._-]/)[0] ?? '';
  return firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : 'você';
}

const delay = (ms: number) => ({ '--reveal-delay': `${ms}ms` }) as CSSProperties;

export function MemberHome({
  userEmail,
  notificationChannelVerified,
  opportunities,
  monitoredCount,
  targetReachedCount,
  currentOfferCount,
}: MemberHomeProps) {
  const featured = opportunities.slice(0, 3);
  const firstName = firstNameFromEmail(userEmail);

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={`container ${styles.heroInner}`}>
          <div className={`${styles.heroCopy} reveal`}>
            <p className={styles.eyebrow}>Seu espaço de viagem</p>
            <h1>Olá, {firstName}. Vamos encontrar uma boa rota?</h1>
            <p className={styles.heroLead}>
              O Flight Watch reúne oportunidades observadas pelo sistema, seus alertas e o caminho
              mais claro para decidir quando comprar.
            </p>
            <div className={styles.heroActions}>
              <Link href="/search" className={primaryLg}>
                <IconSearch size={18} />
                Buscar passagens
              </Link>
              <Link href="/watches" className={secondaryLg}>
                <IconBell size={18} />
                Ver monitoramentos
              </Link>
            </div>
            <p className={styles.heroNote}>Conectado como {userEmail}</p>
          </div>

          <aside
            className={`${styles.overview} reveal`}
            style={delay(80)}
            aria-label="Resumo atual"
          >
            <div className={styles.overviewHeader}>
              <span className={styles.overviewIcon}>
                <IconCheckCircle size={18} />
              </span>
              <span>Visão geral da sua conta</span>
            </div>
            <div className={styles.overviewMain}>
              <strong>{currentOfferCount}</strong>
              <span>ofertas atuais nas rotas observadas</span>
            </div>
            <dl className={styles.overviewStats}>
              <div>
                <dt>Monitoramentos</dt>
                <dd>{monitoredCount}</dd>
              </div>
              <div>
                <dt>Metas atingidas</dt>
                <dd>{targetReachedCount}</dd>
              </div>
            </dl>
            <Link href="/watches" className={styles.overviewLink}>
              Abrir meu painel
              <span aria-hidden="true">↗</span>
            </Link>
          </aside>
        </div>
      </section>

      <section
        className={`container ${styles.section} reveal`}
        style={delay(140)}
        aria-labelledby="member-promotions-title"
      >
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.sectionKicker}>O que está valendo a pena agora</p>
            <h2 id="member-promotions-title" className={styles.sectionTitle}>
              Promoções observadas por parceiros
            </h2>
            <p className={styles.sectionLead}>
              Preços encontrados em sites parceiros, comparados com o histórico que o sistema já
              observou.
            </p>
          </div>
          <Link href="/opportunities" className={styles.sectionLink}>
            Ver todas →
          </Link>
        </div>
        {featured.length > 0 ? (
          <>
            <div className={styles.dealGrid}>
              {featured.map((opportunity) => (
                <DealCard key={opportunity.searchTargetId} opportunity={opportunity} compact />
              ))}
            </div>
            <PurchaseNote />
          </>
        ) : (
          <p className={styles.emptyDeals}>
            Ainda não há uma promoção destacada. Você pode buscar uma rota ou abrir a área de
            oportunidades para ver o feed completo.
          </p>
        )}
      </section>

      <section
        className={`container ${styles.section} reveal`}
        style={delay(200)}
        aria-labelledby="travel-discovery-title"
      >
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.sectionKicker}>Para a próxima etapa da viagem</p>
            <h2 id="travel-discovery-title" className={styles.sectionTitle}>
              Passagens, estadias e experiências
            </h2>
          </div>
        </div>
        <div className={styles.discoveryGrid}>
          <article className={`${styles.discoveryCard} ${styles.discoveryActive}`}>
            <span className={styles.discoveryIcon}>
              <IconExternalLink size={20} />
            </span>
            <p className={styles.discoveryLabel}>Disponível agora</p>
            <h3>Passagens em sites parceiros</h3>
            <p>
              Compare as oportunidades que o Flight Watch encontrou e finalize a compra diretamente
              no parceiro.
            </p>
            <Link href="/opportunities" className={styles.discoveryLink}>
              Explorar passagens <span aria-hidden="true">↗</span>
            </Link>
          </article>
          <article className={styles.discoveryCard}>
            <span className={styles.discoveryIcon}>
              <IconShield size={20} />
            </span>
            <p className={styles.discoveryLabel}>Em preparação</p>
            <h3>Pacotes de viagem</h3>
            <p>
              Estamos preparando novas integrações para reunir hospedagem e experiências sem perder
              a transparência sobre preço e parceiro.
            </p>
            <span className={styles.discoveryMuted}>Em breve no Flight Watch</span>
          </article>
        </div>
      </section>

      <section className={`container ${styles.section} reveal`} style={delay(260)}>
        <div className={styles.accountGrid}>
          <article className={styles.accountCard} aria-labelledby="account-title">
            <div className={styles.accountIcon}>
              <IconUser size={20} />
            </div>
            <p className={styles.sectionKicker}>Sua conta</p>
            <h2 id="account-title">Tudo pronto para acompanhar seus preços?</h2>
            <p className={styles.accountEmail}>{userEmail}</p>
            <div className={styles.verification}>
              <IconCheckCircle size={16} />
              <span>
                {notificationChannelVerified
                  ? 'E-mail verificado para receber alertas'
                  : 'Verifique seu e-mail para ativar os alertas'}
              </span>
            </div>
            {!notificationChannelVerified && (
              <Link href="/verify-email" className={styles.accountLink}>
                Ver instruções de confirmação
              </Link>
            )}
          </article>

          <article className={styles.howCard} aria-labelledby="member-how-title">
            <p className={styles.sectionKicker}>O papel do Flight Watch</p>
            <h2 id="member-how-title">Você decide com mais contexto</h2>
            <div className={styles.howList}>
              <div>
                <strong>1</strong>
                <p>O sistema observa preços de rotas e registra o histórico.</p>
              </div>
              <div>
                <strong>2</strong>
                <p>As promoções aparecem com o motivo da comparação.</p>
              </div>
              <div>
                <strong>3</strong>
                <p>Você escolhe quando comprar no site parceiro.</p>
              </div>
            </div>
            <Link href="/transparencia" className={styles.accountLink}>
              Conheça nossos critérios →
            </Link>
          </article>
        </div>
      </section>
    </div>
  );
}
