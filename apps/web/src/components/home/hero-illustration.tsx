'use client';

import { useEffect, useState } from 'react';
import { HeroLiveCard } from './hero-live-card';
import type { HeroPromotion } from './hero-promotion';
import styles from './hero-illustration.module.css';

export interface ExampleDeal {
  origin: string;
  destination: string;
  price: string;
  dropLabel: string;
  badge: string;
  points: Array<[number, number]>;
}

/**
 * CP-14: não é dado real, por isso toda entrada é rotulada "Exemplo" de forma
 * visível (não só no `aria-label`). Aparece quando a pessoa ainda não
 * escolheu a origem (ou o feed falhou) e nas telas de conta. Os textos seguem
 * o que a SPEC-032 calcula — "abaixo das datas próximas", nunca histórico —
 * e o gráfico é "preço por data" com a mediana tracejada, como no cartão real.
 */
const EXAMPLES: ExampleDeal[] = [
  {
    origin: 'GRU',
    destination: 'MIA',
    price: 'R$ 1.212,00',
    dropLabel: '↓ 18% abaixo das datas próximas',
    badge: 'Promoção identificada',
    points: [
      [0, 52],
      [34, 44],
      [68, 58],
      [102, 40],
      [136, 70],
      [170, 64],
      [204, 92],
      [238, 86],
      [272, 118],
    ],
  },
  {
    origin: 'GRU',
    destination: 'JFK',
    price: 'R$ 2.030,00',
    dropLabel: '↓ 21% abaixo das datas próximas',
    badge: 'Promoção identificada',
    points: [
      [0, 30],
      [34, 48],
      [68, 36],
      [102, 55],
      [136, 50],
      [170, 72],
      [204, 66],
      [238, 90],
      [272, 104],
    ],
  },
];

// Troca decorativa, não vinculada a dado real — por isso o intervalo e a
// duração são escolhas de produto, não valores de domínio. Pausa sob
// movimento reduzido (MO-01): só o primeiro exemplo fica visível, parado.
const CYCLE_MS = 5000;

export interface HeroIllustrationProps {
  /** SPEC-032: promoção real da origem da pessoa; sem ela, os exemplos. */
  live?: HeroPromotion | null;
}

export function HeroIllustration({ live = null }: HeroIllustrationProps) {
  const [frontIndex, setFrontIndex] = useState(0);

  useEffect(() => {
    if (live || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const id = window.setInterval(() => {
      setFrontIndex((index) => (index + 1) % EXAMPLES.length);
    }, CYCLE_MS);
    return () => window.clearInterval(id);
  }, [live]);

  if (live) {
    return (
      <figure className={styles.figure}>
        <HeroLiveCard live={live} />
      </figure>
    );
  }

  return (
    <figure className={styles.figure} aria-label="Exemplos de promoções identificadas pelo sistema">
      {EXAMPLES.map((deal, index) => (
        <DealSlot
          key={`${deal.origin}-${deal.destination}`}
          deal={deal}
          front={index === frontIndex}
        />
      ))}
    </figure>
  );
}

function DealSlot({ deal, front }: { deal: ExampleDeal; front: boolean }) {
  const line = deal.points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
  const area = `${line} L272 150 L0 150 Z`;
  const last = deal.points[deal.points.length - 1] ?? [272, 118];
  const gradientId = `fw-hero-area-${deal.origin}-${deal.destination}`;
  const planePath = 'M12 32 Q 80 -8 148 32';

  return (
    <div className={styles.slot} data-position={front ? 'front' : 'back'} aria-hidden="true">
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.example}>Exemplo</span>
          <span className={styles.badge}>{deal.badge}</span>
        </div>

        <div className={styles.route}>
          <span className="iata">{deal.origin}</span>
          <svg viewBox="0 0 160 40" className={styles.routeArc}>
            <circle cx="6" cy="32" r="4.5" className={styles.dotOrigin} />
            <path d={planePath} pathLength={1} className={styles.routePath} />
            <circle cx="154" cy="32" r="4.5" className={styles.dotDestination} />
            <circle r="3.2" className={styles.plane}>
              <animateMotion
                dur="1.6s"
                begin="0.2s"
                fill="freeze"
                path={planePath}
                calcMode="spline"
                keyTimes="0;1"
                keySplines="0.4 0 0.2 1"
              />
            </circle>
          </svg>
          <span className="iata">{deal.destination}</span>
        </div>

        <div className={styles.priceRow}>
          <div>
            <span className={styles.label}>Menor preço observado</span>
            <span className={styles.price}>{deal.price}</span>
          </div>
          <span className={styles.drop}>{deal.dropLabel}</span>
        </div>

        <svg viewBox="0 0 280 150" className={styles.chart}>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--color-brand)" stopOpacity="0.14" />
              <stop offset="1" stopColor="var(--color-brand)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} className={styles.area} />
          <line x1="0" x2="272" y1="62" y2="62" className={styles.referenceLine} />
          <path d={line} pathLength={1} className={styles.line} />
          <circle cx={last[0]} cy={last[1]} r="6" className={styles.lastPoint} />
          <circle cx={last[0]} cy={last[1]} r="6" className={styles.lastRing} />
        </svg>

        <div className={styles.actions}>
          <span className={styles.buy}>Comprar passagem ↗</span>
          <span className={styles.watch}>Monitorar</span>
        </div>
      </div>
    </div>
  );
}
