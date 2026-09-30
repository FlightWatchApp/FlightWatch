'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { IconClock, IconExternalLink, IconRoute } from '@/components/ui/icon';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Modal } from '@/components/ui/modal';
import { TextInput } from '@/components/ui/text-input';
import type { OpportunityItem } from '@/lib/api/types';
import { formatDate } from '@/lib/domain/freshness';
import { formatMoney, parseAmountMinor } from '@/lib/domain/money';
import { monitorOpportunityAction } from './actions';
import { DealBadge } from './deal-badge';
import styles from './page.module.css';

export interface OpportunityCardProps {
  opportunity: OpportunityItem;
  /** SPEC-016: destacado quando o marcador correspondente é selecionado no mapa. */
  selected?: boolean;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h${remaining.toString().padStart(2, '0')}`;
}

/** SPEC-015 §"Critérios de aceitação": abrir a página nunca cria Watch sozinho — só o modal confirma. */
export function OpportunityCard({ opportunity, selected = false }: OpportunityCardProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [targetPrice, setTargetPrice] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const { deal, offer } = opportunity;
  const expired = offer.status === 'EXPIRED';

  function handleConfirm(): void {
    const targetAmountMinor = parseAmountMinor(targetPrice);
    if (targetAmountMinor === null) {
      setFormError('Informe um preço-alvo válido, maior que zero.');
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
        if (result.success && result.watchId) {
          router.push(`/watches/${result.watchId}`);
        } else {
          setFormError(result.error ?? 'Não foi possível criar o monitoramento.');
        }
      })();
    });
  }

  return (
    <Card className={selected ? styles.cardSelected : undefined}>
      <div className={styles.cardTop}>
        <span className={styles.cardRoute}>
          {opportunity.origin}
          <IconRoute size={16} />
          {opportunity.destination}
        </span>
        <span className={styles.cardPrice}>
          {formatMoney({ amountMinor: offer.amountMinor, currency: offer.currency })}
        </span>
      </div>

      <div className={styles.cardDealRow}>
        <DealBadge deal={deal} />
        <span className={styles.dealExplanation}>{deal.explanation}</span>
      </div>

      <div className={styles.cardMeta}>
        <span>{formatDate(opportunity.departureDate)}</span>
        <span>
          <IconClock size={14} /> {formatDuration(offer.durationMinutes)}
        </span>
        <span>
          {offer.connectionsCount === 0
            ? 'Direto'
            : `${offer.connectionsCount} ${offer.connectionsCount === 1 ? 'conexão' : 'conexões'}`}
        </span>
      </div>

      <div className={styles.cardActions}>
        {offer.purchaseUrl && (
          <a
            href={offer.purchaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.purchaseLink}
          >
            {expired ? 'Ver oferta (expirada)' : 'Ver oferta'}
            <IconExternalLink size={14} />
          </a>
        )}
        <Button variant="secondary" size="sm" onClick={() => setModalOpen(true)}>
          Monitorar
        </Button>
      </div>

      <Modal open={modalOpen} title="Monitorar este preço" onClose={() => setModalOpen(false)}>
        <p className={styles.modalIntro}>
          Avisamos por e-mail quando o preço atingir o valor que você definir.
        </p>
        <FormField
          label="Preço-alvo"
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
              value={targetPrice}
              onChange={(event) => setTargetPrice(event.target.value)}
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
      </Modal>
    </Card>
  );
}
