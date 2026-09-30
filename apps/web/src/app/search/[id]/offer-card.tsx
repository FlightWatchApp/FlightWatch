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
import type { FlightSearchOfferView } from '@/lib/api/types';
import { formatMoney, parseAmountMinor } from '@/lib/domain/money';
import { deriveWatchAction } from './actions';
import styles from './page.module.css';

export interface OfferCardProps {
  offer: FlightSearchOfferView;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h${remaining.toString().padStart(2, '0')}`;
}

/**
 * SPEC-014 §"Contrato de oferta": `purchaseUrl` é `null` quando o deep link
 * não passa na allowlist — o card nunca inventa um link nesse caso, mesmo
 * que `deeplink` bruto exista no banco.
 */
export function OfferCard({ offer }: OfferCardProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [targetPrice, setTargetPrice] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const first = offer.segments[0];
  const last = offer.segments[offer.segments.length - 1];
  const expired = offer.availabilityStatus === 'EXPIRED';

  function handleConfirm(): void {
    const targetAmountMinor = parseAmountMinor(targetPrice);
    if (targetAmountMinor === null) {
      setFormError('Informe um preço-alvo válido, maior que zero.');
      return;
    }
    setFormError(null);
    startTransition(() => {
      void (async () => {
        const result = await deriveWatchAction(offer.id, targetAmountMinor);
        if (result.success && result.watchId) {
          router.push(`/watches/${result.watchId}`);
        } else {
          setFormError(result.error ?? 'Não foi possível criar o monitoramento.');
        }
      })();
    });
  }

  return (
    <Card>
      <div className={styles.offerTop}>
        {first && last && (
          <span className={styles.offerRoute}>
            {first.originIata}
            <IconRoute size={16} />
            {last.destinationIata}
          </span>
        )}
        <span className={styles.offerPrice}>
          {formatMoney({ amountMinor: offer.totalAmountMinor, currency: offer.currency })}
        </span>
      </div>

      <div className={styles.offerMeta}>
        <span>
          <IconClock size={14} /> {formatDuration(offer.durationMinutes)}
        </span>
        <span>
          {offer.connectionsCount === 0
            ? 'Direto'
            : `${offer.connectionsCount} ${offer.connectionsCount === 1 ? 'conexão' : 'conexões'}`}
        </span>
        <span>Preço observado — não garantido pelo fornecedor até a confirmação da compra.</span>
      </div>

      <div className={styles.offerActions}>
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
