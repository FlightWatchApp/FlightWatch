import type { CSSProperties } from 'react';
import Link from 'next/link';
import type { PromotionHighlight, PromotionItem } from '@flight-watch/contracts';
import { PromotionCard } from '@/components/promotions/promotion-card';
import { PurchaseNote } from '@/components/purchase/purchase-note';
import buttonStyles from '@/components/ui/button.module.css';
import { IconBell, IconExternalLink, IconSearch, IconShield } from '@/components/ui/icon';
import { HeroIllustration } from './hero-illustration';
import { HeroOriginPicker } from './hero-origin-picker';
import { type HeroPromotion, heroFrom } from './hero-promotion';
import styles from './landing.module.css';
import { routePagesEnabled } from '@/lib/domain/route-flag';

const primaryLg = [buttonStyles.button, buttonStyles.primary, buttonStyles.lg].join(' ');
const secondaryLg = [buttonStyles.button, buttonStyles.secondary, buttonStyles.lg].join(' ');

const delay = (ms: number) => ({ '--reveal-delay': `${ms}ms` }) as CSSProperties;

export interface LandingProps {
  /** SPEC-032: promoções seguintes à do cartão, da mesma origem; [] sem origem ou sem promoção. */
  morePromotions?: PromotionItem[];
  /** SPEC-032: promoção real do cartão do topo; null mostra o exemplo. */
  heroPromotion?: HeroPromotion | null;
  /** Há cidade escolhida (cookie) ou sugerida, mesmo que sem promoção agora. */
  heroOriginChosen?: boolean;
  /** SPEC-034: cidade sugerida pelo acesso (não gravada); null se escolhida ou sem sugestão. */
  originSuggestion?: { code: string; name: string } | null;
  /** SPEC-034: vitrine das cidades mais usadas, cada promoção com a sua origem. */
  showcase?: PromotionHighlight[];
}

/** Quantos cartões cada seção mostra. */
const SECTION_SIZE = 3;

/**
 * PG-01: início para visitante. As promoções já vêm resolvidas pelo chamador
 * (`app/page.tsx`), que também absorve a falha do feed; sem origem escolhida
 * a seção pede a cidade, nunca inventa uma.
 */
export function Landing({
  morePromotions = [],
  heroPromotion = null,
  heroOriginChosen = false,
  originSuggestion = null,
  showcase = [],
}: LandingProps) {
  // Promoções da origem (escolhida ou sugerida) — a do cartão e as seguintes.
  const promotions = heroPromotion ? [heroPromotion.promotion, ...morePromotions] : [];
  // SPEC-034: sem promoção da origem, o cartão do topo vem da vitrine.
  const showcaseHero = !heroPromotion && showcase[0] ? showcase[0] : null;
  const hero =
    heroPromotion ??
    (showcaseHero ? heroFrom(showcaseHero.origin, showcaseHero.originName, showcaseHero) : null);
  // "Destaques do Brasil" sem repetir destinos já mostrados acima.
  const shown = new Set([
    ...promotions.slice(0, SECTION_SIZE).map((promotion) => promotion.destination),
    ...(hero ? [hero.promotion.destination] : []),
  ]);
  const highlights = showcase
    .filter((promotion) => !shown.has(promotion.destination))
    .slice(0, SECTION_SIZE * 2);
  const renderedAt = hero?.renderedAt ?? new Date().toISOString();
  const pickerOrigin = heroPromotion
    ? { code: heroPromotion.origin, name: heroPromotion.originName }
    : originSuggestion;

  return (
    <>
      <section className={styles.hero}>
        <div className={`container ${styles.heroInner}`}>
          <div className={`${styles.heroCopy} reveal`}>
            <p className={styles.eyebrow}>Monitoramento de passagens aéreas</p>
            <h1 className={styles.heroTitle}>Passagens observadas de perto.</h1>
            <p className={styles.heroLead}>
              O Flight Watch acompanha o preço das rotas, aponta as promoções comparando cada preço
              com as outras datas da mesma rota e leva você direto ao site parceiro para comprar.
            </p>
            <div className={styles.heroActions}>
              <Link href="/opportunities" className={primaryLg}>
                Ver promoções de hoje
              </Link>
              <Link href="/search" className={secondaryLg}>
                <IconSearch size={18} />
                Buscar passagens
              </Link>
            </div>
            <p className={styles.heroNote}>
              Grátis para buscar e ver promoções. Crie conta só para receber alertas.
            </p>
          </div>
          <div className={styles.heroArt}>
            <HeroIllustration live={hero} />
            <HeroOriginPicker
              key={pickerOrigin?.code ?? 'none'}
              origin={pickerOrigin}
              noPromotion={heroOriginChosen && !heroPromotion}
              suggested={originSuggestion !== null}
            />
            {hero?.promotion.purchaseUrl && !hero.offerHref && <PurchaseNote />}
          </div>
        </div>
      </section>

      {heroPromotion && promotions.length > 0 && (
        <section
          className={`container ${styles.section} reveal`}
          style={delay(80)}
          aria-labelledby="promo-title"
        >
          <div className={styles.sectionHead}>
            <div>
              <h2 id="promo-title" className={styles.sectionTitle}>
                Promoções saindo de {heroPromotion.originName}
              </h2>
              <p className={styles.sectionLead}>
                Datas em que o preço observado está bem abaixo das outras datas próximas da mesma
                rota.
              </p>
            </div>
            <Link href="/opportunities" className={styles.sectionLink}>
              Ver todas →
            </Link>
          </div>
          <div className={styles.dealGrid}>
            {promotions.slice(0, SECTION_SIZE).map((promotion) => (
              <PromotionCard
                offerPages={routePagesEnabled()}
                key={promotion.destination}
                origin={heroPromotion.origin}
                originName={heroPromotion.originName}
                promotion={promotion}
                renderedAt={renderedAt}
              />
            ))}
          </div>
          <PurchaseNote />
        </section>
      )}

      <section
        className={`container ${styles.section} reveal`}
        style={delay(120)}
        aria-labelledby="showcase-title"
      >
        <div className={styles.sectionHead}>
          <div>
            <h2 id="showcase-title" className={styles.sectionTitle}>
              Destaques do Brasil
            </h2>
            <p className={styles.sectionLead}>
              As melhores promoções saindo das cidades mais usadas do país. Cada cartão diz de onde
              sai.
            </p>
          </div>
          <Link href="/opportunities" className={styles.sectionLink}>
            Escolher minha cidade →
          </Link>
        </div>
        {highlights.length > 0 ? (
          <>
            <div className={styles.dealGrid}>
              {highlights.map((promotion) => (
                <PromotionCard
                  offerPages={routePagesEnabled()}
                  key={`${promotion.origin}-${promotion.destination}`}
                  origin={promotion.origin}
                  originName={promotion.originName}
                  promotion={promotion}
                  renderedAt={renderedAt}
                />
              ))}
            </div>
            <PurchaseNote />
          </>
        ) : heroOriginChosen && !heroPromotion ? (
          <p className={styles.emptyDeals}>
            Nenhuma promoção saindo desta cidade neste momento. Escolha outra cidade de origem ou
            monitore a sua viagem para ser avisado quando o preço cair.
          </p>
        ) : (
          <p className={styles.emptyDeals}>
            Nenhum destaque no momento. Escolha a cidade de onde você sai, no cartão acima, para ver
            as promoções a partir dela.
          </p>
        )}
      </section>

      <section
        className={`container ${styles.section} reveal`}
        style={delay(160)}
        aria-labelledby="how-title"
      >
        <h2 id="how-title" className={styles.sectionTitle}>
          Como funciona
        </h2>
        <ol className={styles.steps}>
          <li className={styles.step}>
            <span className={styles.stepIcon}>
              <IconSearch size={20} />
            </span>
            <h3>Busque ou escolha uma promoção</h3>
            <p>
              Veja as ofertas de uma rota ou as promoções que o sistema encontrou comparando cada
              preço com as outras datas da mesma rota.
            </p>
          </li>
          <li className={styles.step}>
            <span className={styles.stepIcon}>
              <IconBell size={20} />
            </span>
            <h3>Monitore o preço</h3>
            <p>
              Defina o preço que você quer pagar. O sistema consulta a rota periodicamente e avisa
              por e-mail quando o preço observado chegar lá.
            </p>
          </li>
          <li className={styles.step}>
            <span className={styles.stepIcon}>
              <IconExternalLink size={20} />
            </span>
            <h3>Compre no parceiro</h3>
            <p>
              Um clique leva você à oferta no site parceiro, onde você confirma o preço e finaliza a
              compra.
            </p>
          </li>
        </ol>
      </section>

      <section className={`container ${styles.section} reveal`} style={delay(200)}>
        <div className={styles.trust}>
          <span className={styles.trustIcon}>
            <IconShield size={24} />
          </span>
          <div>
            <h2 className={styles.trustTitle}>Preço com data, promoção com motivo</h2>
            <p>
              Todo preço mostra quando foi observado. Toda promoção explica a comparação que a
              justificou. Não prometemos que é o preço mais baixo de todos os sites: mostramos o que
              o sistema observou e deixamos a decisão com você.
            </p>
            <Link href="/transparencia" className={styles.trustLink}>
              Como ganhamos dinheiro →
            </Link>
          </div>
        </div>
      </section>

      <section className={`container ${styles.section}`}>
        <div className={styles.band}>
          <div>
            <h2 className={styles.bandTitle}>Receba o aviso quando o preço cair</h2>
            <p className={styles.bandLead}>
              Conta grátis. Um e-mail quando a sua regra for atendida.
            </p>
          </div>
          <Link
            href="/register"
            className={`${buttonStyles.button} ${buttonStyles.lg} ${styles.bandCta}`}
          >
            Criar conta grátis
          </Link>
        </div>
      </section>
    </>
  );
}
