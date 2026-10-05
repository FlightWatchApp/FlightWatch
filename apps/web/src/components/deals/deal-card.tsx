'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { monitorOpportunityAction } from '@/app/opportunities/actions';
import { RouteLine } from '@/components/brand/route-line';
import { PurchaseButton } from '@/components/purchase/purchase-button';
import { PurchaseNote } from '@/components/purchase/purchase-note';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Freshness } from '@/components/ui/freshness';
import { IconClock } from '@/components/ui/icon';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Modal } from '@/components/ui/modal';
import { TextInput } from '@/components/ui/text-input';
import { WatchCreatedSummary } from '@/components/watches/watch-created-summary';
import type { OpportunityItem, WatchDetail } from '@/lib/api/types';
import { formatDate } from '@/lib/domain/freshness';
import { formatMoney, parseAmountMinor } from '@/lib/domain/money';
import { DealBadge } from './deal-badge';
import styles from './deal-card.module.css';

export interface DealCardProps {
  opportunity: OpportunityItem;
  /** SPEC-016: destacado quando o marcador correspondente é selecionado no mapa. */
  selected?: boolean;
  /** Cartões compactos (home) não repetem o `PurchaseNote` individualmente. */
  compact?: boolean;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h${remaining.toString().padStart(2, '0')}`;
}

/**
 * CP-08: substitui `app/opportunities/opportunity-card.tsx`. Conteúdo
 * obrigatório, nesta ordem: selo + frescor, rota, datas/duração/conexões,
 * preço observado, economia (ou "1 adulto · econômica"), explicação da
 * promoção, ações. Abrir o cartão nunca cria Watch sozinho — só o modal
 * confirma.
 */
export function DealCard({ opportunity, selected = false, compact = false }: DealCardProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [desiredPrice, setDesiredPrice] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [createdWatch, setCreatedWatch] = useState<WatchDetail | null>(null);
  const [isPending, startTransition] = useTransition();

  const { deal, offer } = opportunity;
  const tripLabel =
    opportunity.tripType === 'ROUND_TRIP' && opportunity.returnDate
      ? `${formatDate(opportunity.departureDate)} → ${formatDate(opportunity.returnDate)}`
      : `Só ida · ${formatDate(opportunity.departureDate)}`;
  const stops =
    offer.connectionsCount === 0
      ? 'Direto'
      : `${offer.connectionsCount} ${offer.connectionsCount === 1 ? 'conexão' : 'conexões'}`;
  const savingAmountMinor = deal.referenceAmountMinor - deal.currentAmountMinor;
  const ariaLabel = `Promoção ${opportunity.origin} para ${opportunity.destination}, ${formatMoney({
    amountMinor: offer.amountMinor,
    currency: offer.currency,
  })}`;

  function handleConfirm(): void {
    const targetAmountMinor = parseAmountMinor(desiredPrice);
    if (targetAmountMinor === null) {
      setFormError('Informe um preço desejado válido, maior que zero.');
      return;
    }
    setFormError(null);
    startTransition(() => {
      void (async () => {
        const result = await monitorOpportunityAction(
          {
            origin: opportunity.origin,
            destination: opportunity.destination,
            tripType: opportunity.tripType,
            market: opportunity.market,
            departureDate: opportunity.departureDate,
            returnDate: opportunity.returnDate,
            currency: offer.currency,
          },
          targetAmountMinor,
        );
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
    <article aria-label={ariaLabel}>
      <Card padding="sm" className={`${styles.card} ${selected ? styles.selected : ''}`.trim()}>
        <div className={styles.top}>
          <DealBadge deal={deal} />
          <Freshness
            observedAt={offer.observedAt}
            expiresAt={offer.expiresAt}
            prefix="Preço visto"
          />
        </div>

        <div className={styles.routeRow}>
          <RouteLine origin={opportunity.origin} destination={opportunity.destination} showCities />
        </div>

        <div className={styles.meta}>
          <span>{tripLabel}</span>
          <span>
            <IconClock size={14} /> {formatDuration(offer.durationMinutes)}
          </span>
          <span>{stops}</span>
        </div>

        <div className={styles.priceBlock}>
          <p className={styles.priceLabel}>Preço observado</p>
          <p className={`${styles.price} tabular-nums`}>
            {formatMoney({ amountMinor: offer.amountMinor, currency: offer.currency })}
          </p>
        </div>

        <p className={styles.saving}>
          {deal.dealType === 'PERCENTAGE_BELOW_REFERENCE' && savingAmountMinor > 0
            ? `${formatMoney({ amountMinor: savingAmountMinor, currency: offer.currency })} abaixo da média`
            : '1 adulto · econômica'}
        </p>

        <p className={styles.explanation}>
          {deal.explanation} Base: {deal.observationCount}{' '}
          {deal.observationCount === 1 ? 'preço observado' : 'preços observados'} pelo sistema.
        </p>

        <div className={styles.actions}>
          {offer.purchaseUrl ? (
            <PurchaseButton
              href={offer.purchaseUrl}
              status={offer.status}
              context={`${opportunity.origin} para ${opportunity.destination}`}
            />
          ) : (
            <span className={styles.purchaseUnavailable}>
              Link de compra indisponível para esta oferta
            </span>
          )}
          <Button variant="secondary" onClick={() => setModalOpen(true)}>
            Monitorar preço
          </Button>
        </div>

        {!compact && <PurchaseNote />}

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
    </article>
  );
}
