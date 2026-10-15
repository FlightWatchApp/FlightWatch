'use client';

import { useEffect, useState } from 'react';
import type { WatchPreviewResponse } from '@flight-watch/contracts';
import { previewWatchAction } from '@/app/watches/new/actions';
import { PriceByDateChart } from '@/components/charts/price-by-date-chart';
import { formatMoney } from '@/lib/domain/money';
import { monthsLabel } from '@/lib/domain/price-chart';
import type { TripType } from '@/lib/api/types';
import styles from './low-price-preview.module.css';

export interface LowPricePreviewProps {
  origin: string | null;
  destination: string | null;
  tripType: TripType;
  departureDate: string;
  returnDate: string;
  /** A prévia é em reais (únicos dados da fonte hoje); outra moeda fica só com o texto. */
  currency: string;
}

/** Resultado guardado com a consulta que o gerou: "carregando" é só a consulta atual sem resultado. */
type PreviewResult = { query: string; preview: WatchPreviewResponse | null };

type PreviewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; preview: WatchPreviewResponse }
  | { kind: 'unavailable' };

/**
 * "Vamos avisar quando…" — o que o alerta promete (SPEC-039). A porcentagem
 * vem da API; sem ela, o texto não inventa um número.
 */
export function lowPriceAlertExplanation(dropPercent: number | null): string {
  const below =
    dropPercent !== null ? `pelo menos ${dropPercent}% abaixo do normal` : 'bem abaixo do normal';
  return `Vamos avisar quando observarmos um preço ${below} ou o menor preço já observado pelo Flight Watch para esta viagem.`;
}

/**
 * SPEC-039 §"Tela de criação": no lugar do preço desejado, o que o sistema
 * já sabe da viagem. Só busca com rota e datas completas; qualquer falha
 * mostra o texto do alerta sem números.
 */
export function LowPricePreview({
  origin,
  destination,
  tripType,
  departureDate,
  returnDate,
  currency,
}: LowPricePreviewProps) {
  const [result, setResult] = useState<PreviewResult | null>(null);
  const complete =
    currency === 'BRL' &&
    origin !== null &&
    destination !== null &&
    origin !== destination &&
    departureDate !== '' &&
    (tripType === 'ONE_WAY' || returnDate !== '');
  const query = complete
    ? [
        origin,
        destination,
        tripType,
        departureDate,
        tripType === 'ROUND_TRIP' ? returnDate : '',
      ].join('|')
    : null;

  useEffect(() => {
    if (query === null || origin === null || destination === null) return;
    let cancelled = false;
    void previewWatchAction({
      origin,
      destination,
      tripType,
      departureDate,
      returnDate: tripType === 'ROUND_TRIP' ? returnDate : null,
    }).then((preview) => {
      if (!cancelled) setResult({ query, preview });
    });
    return () => {
      cancelled = true;
    };
  }, [query, origin, destination, tripType, departureDate, returnDate]);

  const state: PreviewState =
    query === null
      ? { kind: 'idle' }
      : result?.query !== query
        ? { kind: 'loading' }
        : result.preview
          ? { kind: 'ready', preview: result.preview }
          : { kind: 'unavailable' };

  if (state.kind !== 'ready') {
    return (
      <div className={styles.preview} aria-live="polite">
        <p className={styles.explanation}>
          {state.kind === 'loading'
            ? 'Consultando o preço normal desta viagem…'
            : lowPriceAlertExplanation(null)}
        </p>
      </div>
    );
  }

  const { preview } = state;
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency: preview.currency });
  const hasNumbers =
    preview.typicalAmountMinor !== null ||
    preview.lowestAmountMinor !== null ||
    preview.currentAmountMinor !== null;
  const months = [...new Set(preview.days.map((day) => day.date.slice(0, 7)))];

  return (
    <section className={styles.preview} aria-label="Preço desta viagem" aria-live="polite">
      {hasNumbers ? (
        <dl className={styles.stats}>
          <div>
            <dt>Preço normal</dt>
            <dd>{preview.typicalAmountMinor !== null ? money(preview.typicalAmountMinor) : '—'}</dd>
          </div>
          <div>
            <dt>Menor já observado</dt>
            <dd>{preview.lowestAmountMinor !== null ? money(preview.lowestAmountMinor) : '—'}</dd>
          </div>
          <div>
            <dt>Na sua data</dt>
            <dd>{preview.currentAmountMinor !== null ? money(preview.currentAmountMinor) : '—'}</dd>
          </div>
        </dl>
      ) : (
        <p className={styles.empty}>
          Ainda não temos histórico desta viagem. Vamos acompanhar e avisar quando o preço cair.
        </p>
      )}

      {preview.days.length > 1 && (
        <PriceByDateChart
          days={preview.days}
          highlight={
            preview.currentAmountMinor !== null
              ? { date: departureDate, amountMinor: preview.currentAmountMinor }
              : null
          }
          highlightLabel="sua data"
          referenceAmountMinor={
            preview.typicalSource === 'NEARBY_DATES' ? preview.typicalAmountMinor : null
          }
          currency={preview.currency}
          periodLabel={monthsLabel(months)}
          height="9rem"
        />
      )}

      {preview.typicalSource && (
        <p className={styles.source}>
          {preview.typicalSource === 'HISTORY'
            ? 'Preço normal calculado com os preços que observamos nos últimos 30 dias.'
            : 'Preço normal calculado com os preços das datas próximas desta rota.'}
        </p>
      )}
      <p className={styles.explanation}>{lowPriceAlertExplanation(preview.dropPercent)}</p>
    </section>
  );
}
