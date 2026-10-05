'use client';

import { useSyncExternalStore } from 'react';
import {
  formatAbsoluteDateTime,
  formatRelativeTime,
  formatRemainingDuration,
  isOfferExpired,
} from '@/lib/domain/freshness';
import styles from './freshness.module.css';

const TICK_INTERVAL_MS = 30_000;

/**
 * Um único `setInterval` compartilhado por todas as instâncias de `Freshness`
 * da página — não um por componente. `getServerSnapshot` devolve `null`: no
 * servidor (e na primeira pintura da hidratação) não tem sentido falar de
 * "agora", então o componente mostra a data absoluta; assim que o cliente
 * está de pé, o snapshot deixa de ser `null` e passa a mostrar o relativo.
 */
let tick = 0;
const listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (intervalId === null) {
    intervalId = setInterval(() => {
      tick += 1;
      listeners.forEach((l) => l());
    }, TICK_INTERVAL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

function getSnapshot(): number {
  return tick;
}

function getServerSnapshot(): null {
  return null;
}

export interface FreshnessProps {
  observedAt: string;
  expiresAt?: string | null;
  /** Padrão "Observado"; ex.: "Preço visto" nos cartões de busca. */
  prefix?: string;
  /** Texto claro para uso sobre fundo petróleo — mesmo padrão de `Logo`/`RouteLine`. */
  inverse?: boolean;
}

/**
 * CP-04/DS-07: idade do preço, nunca "tempo real". `expiresAt` no futuro
 * mostra um ponto verde pulsando (oferta válida agora); no passado, o texto
 * avisa que a oferta expirou — nunca os dois ao mesmo tempo.
 */
export function Freshness({
  observedAt,
  expiresAt,
  prefix = 'Observado',
  inverse = false,
}: FreshnessProps) {
  const clientTick = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = clientTick !== null;
  const absolute = formatAbsoluteDateTime(observedAt);
  const expired = isOfferExpired(expiresAt ?? null);

  const text = hydrated
    ? `${prefix} ${formatRelativeTime(observedAt)}`
    : `${prefix} em ${absolute}`;

  const validity =
    expiresAt && hydrated
      ? expired
        ? ' · preço expirado, confirme no parceiro'
        : ` · válido por mais ${formatRemainingDuration(expiresAt)}`
      : '';

  return (
    <span
      className={`${styles.freshness} ${expired ? styles.expired : ''} ${inverse ? styles.inverse : ''}`}
    >
      {expiresAt && !expired && <span className={styles.liveDot} aria-hidden="true" />}
      <time dateTime={observedAt} title={absolute}>
        {text}
        {validity}
      </time>
    </span>
  );
}
