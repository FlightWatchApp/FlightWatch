'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { RouteLine } from '@/components/brand/route-line';
import { PurchaseButton } from '@/components/purchase/purchase-button';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Freshness } from '@/components/ui/freshness';
import { IconBell, IconClock } from '@/components/ui/icon';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Modal } from '@/components/ui/modal';
import { TextInput } from '@/components/ui/text-input';
import { WatchCreatedSummary } from '@/components/watches/watch-created-summary';
import type { FlightSearchOfferView, WatchDetail } from '@/lib/api/types';
import { formatFlightTime } from '@/lib/domain/freshness';
import { formatMoney, parseAmountMinor } from '@/lib/domain/money';
import { deriveWatchAction } from './actions';
import styles from './page.module.css';

export interface OfferCardProps {
  offer: FlightSearchOfferView;
  /** CP-16: a oferta mais barata desta busca ganha a marca — nunca "do mercado". */
  cheapest?: boolean;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h${remaining.toString().padStart(2, '0')}`;
}

/**
 * CP-16/SPEC-014 §"Contrato de oferta": `purchaseUrl` é `null` quando o deep
 * link não passa na allowlist — o card nunca inventa um link nesse caso,
 * mesmo que `deeplink` bruto exista no banco.
 */
export function OfferCard({ offer, cheapest = false }: OfferCardProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [desiredPrice, setDesiredPrice] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [createdWatch, setCreatedWatch] = useState<WatchDetail | null>(null);
  const [isPending, startTransition] = useTransition();

  const first = offer.segments[0];
  const last = offer.segments[offer.segments.length - 1];
  const carriers = [...new Set(offer.segments.map((segment) => segment.carrier))].join(' + ');
  const stops =
    offer.connectionsCount === 0
      ? 'Direto'
      : `${offer.connectionsCount} ${offer.connectionsCount === 1 ? 'conexão' : 'conexões'}`;

  function handleConfirm(): void {
    const targetAmountMinor = parseAmountMinor(desiredPrice);
    if (targetAmountMinor === null) {
      setFormError('Informe um preço desejado válido, maior que zero.');
      return;
    }
    setFormError(null);
    startTransition(() => {
      void (async () => {
        const result = await deriveWatchAction(offer.id, targetAmountMinor);
        if (result.success && result.watch) {
          setCreatedWatch(result.watch);
        } else if (result.success && result.watchId) {
          router.push(`/watches/${result.watchId}`);
        } else {
          setFormError(result.error ?? 'Não foi possível criar o monitoramento.');
        }
      })();
    });
  }

  return (
    <Card>
      {cheapest && <p className={styles.cheapestTag}>Mais barata desta busca</p>}

      <div className={styles.offerTop}>
        {first && last && (
          <RouteLine origin={first.originIata} destination={last.destinationIata} size="sm" />
        )}
        <span className={`${styles.offerPrice} tabular-nums`}>
          {formatMoney({ amountMinor: offer.totalAmountMinor, currency: offer.currency })}
        </span>
      </div>

      {first && last && (
        <p className={styles.offerTimes}>
          {formatFlightTime(first.departureAt)} → {formatFlightTime(last.arrivalAt)}{' '}
          <span className={styles.offerTimesNote}>(horários de Brasília)</span>
        </p>
      )}

      <div className={styles.offerMeta}>
        <span>
          <IconClock size={14} /> {formatDuration(offer.durationMinutes)}
        </span>
        <span>{stops}</span>
        <span>
          {carriers || 'Companhia não informada'} ·{' '}
          {offer.cabin === 'ECONOMY' ? 'Econômica' : offer.cabin}
        </span>
      </div>

      <div className={styles.offerFreshness}>
        <Freshness observedAt={offer.observedAt} expiresAt={offer.expiresAt} prefix="Preço visto" />
      </div>

      <div className={styles.offerActions}>
        {offer.purchaseUrl && (
          <PurchaseButton
            href={offer.purchaseUrl}
            status={offer.availabilityStatus}
            {...(first && last
              ? { context: `${first.originIata} para ${last.destinationIata}` }
              : {})}
          />
        )}
        <Button
          variant="secondary"
          size="sm"
          leadingIcon={<IconBell size={14} />}
          onClick={() => setModalOpen(true)}
        >
          Monitorar preço
        </Button>
      </div>

      <Modal
        open={modalOpen}
        size="wide"
        title={createdWatch ? 'Monitoramento criado' : 'Monitorar este preço'}
        onClose={() => {
          setModalOpen(false);
          setCreatedWatch(null);
        }}
      >
        {createdWatch ? (
          <WatchCreatedSummary
            watch={createdWatch}
            onClose={() => {
              setModalOpen(false);
              setCreatedWatch(null);
            }}
          />
        ) : (
          <>
            <p className={styles.modalIntro}>
              O sistema consulta essa rota periodicamente e avisa por e-mail quando o preço
              observado atingir o valor que você definir.
            </p>
            <FormField
              label="Preço desejado"
              hint="Avisamos quando o preço atingir esse valor ou menos."
              required
            >
              {(field) => (
                <TextInput
                  id={field.id}
                  aria-describedby={field.describedBy}
                  invalid={field.invalid}
                  inputMode="decimal"
                  placeholder="800,00"
                  value={desiredPrice}
                  onChange={(event) => setDesiredPrice(event.target.value)}
                />
              )}
            </FormField>
            {formError && <InlineAlert tone="danger">{formError}</InlineAlert>}
            <div className={styles.modalActions}>
              <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={isPending}>
                Cancelar
              </Button>
              <Button onClick={handleConfirm} disabled={isPending}>
                {isPending ? 'Criando…' : 'Confirmar monitoramento'}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </Card>
  );
}
