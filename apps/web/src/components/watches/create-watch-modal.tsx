'use client';

import { type FormEvent, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { PlaceCombobox } from '@/components/places/place-combobox';
import type { SelectedPlace } from '@/components/places/place-options';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { TextInput } from '@/components/ui/text-input';
import { IconPlus } from '@/components/ui/icon';
import { parseAmountMinor } from '@/lib/domain/money';
import type { TripType, WatchDetail } from '@/lib/api/types';
import { createWatchAction } from '@/app/watches/new/actions';
import { WatchCreatedSummary } from './watch-created-summary';
import styles from './create-watch-modal.module.css';

// Moedas aceitas pela API — decisão de negócio. Cidades vêm do catálogo (SPEC-029).
const SUPPORTED_CURRENCIES = ['BRL', 'USD'];

export interface CreateWatchModalProps {
  label?: string;
  triggerClassName?: string | undefined;
}

export function CreateWatchModal({
  label = 'Criar monitoramento',
  triggerClassName,
}: CreateWatchModalProps) {
  const [open, setOpen] = useState(false);
  const [createdWatch, setCreatedWatch] = useState<WatchDetail | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [origin, setOrigin] = useState<SelectedPlace | null>(null);
  const [destination, setDestination] = useState<SelectedPlace | null>(null);
  const [tripType, setTripType] = useState<TripType>('ONE_WAY');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [currency, setCurrency] = useState(SUPPORTED_CURRENCIES[0] ?? '');
  const [targetPrice, setTargetPrice] = useState('');

  function openModal(): void {
    setFormError(null);
    setCreatedWatch(null);
    setOpen(true);
  }

  function closeModal(): void {
    if (isPending) return;
    setOpen(false);
    setFormError(null);
    setCreatedWatch(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFormError(null);

    if (!origin || !destination) {
      setFormError('Escolha a cidade de origem e a de destino na lista.');
      return;
    }
    if (origin.code === destination.code) {
      setFormError('Origem e destino precisam ser cidades diferentes.');
      return;
    }
    if (!departureDate) {
      setFormError('Informe a data de ida.');
      return;
    }
    if (tripType === 'ROUND_TRIP' && !returnDate) {
      setFormError('Informe a data de volta, ou mude para só ida.');
      return;
    }
    const targetAmountMinor = parseAmountMinor(targetPrice);
    if (targetAmountMinor === null) {
      setFormError('Informe um preço desejado válido, maior que zero.');
      return;
    }

    startTransition(() => {
      void (async () => {
        const result = await createWatchAction({
          origin: origin.code,
          destination: destination.code,
          tripType,
          departureDate,
          returnDate: tripType === 'ROUND_TRIP' ? returnDate : null,
          currency,
          market: 'BR',
          targetAmountMinor,
        });

        if (result.success && result.watch) {
          setCreatedWatch(result.watch);
        } else if (result.success) {
          setFormError(
            'Monitoramento criado. Abra a tela de monitoramentos para consultar os detalhes.',
          );
        } else {
          setFormError(result.error ?? 'Não foi possível criar o monitoramento.');
        }
      })();
    });
  }

  return (
    <>
      <button
        type="button"
        className={triggerClassName ?? styles.defaultTrigger}
        onClick={openModal}
      >
        <IconPlus size={16} />
        {label}
      </button>

      <Modal
        open={open}
        size="wide"
        title={createdWatch ? 'Monitoramento criado' : 'Criar monitoramento'}
        onClose={closeModal}
      >
        {createdWatch ? (
          <WatchCreatedSummary watch={createdWatch} onClose={closeModal} />
        ) : (
          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <p className={styles.intro}>
              Escolha uma rota, defina sua meta de preço e acompanhe as próximas oportunidades em um
              só lugar.
            </p>

            <div className={styles.row}>
              <FormField label="Origem" required>
                {(field) => (
                  <PlaceCombobox
                    id={field.id}
                    aria-describedby={field.describedBy}
                    invalid={field.invalid}
                    value={origin}
                    onChange={setOrigin}
                  />
                )}
              </FormField>
              <FormField label="Destino" required>
                {(field) => (
                  <PlaceCombobox
                    id={field.id}
                    aria-describedby={field.describedBy}
                    invalid={field.invalid}
                    value={destination}
                    onChange={setDestination}
                  />
                )}
              </FormField>
            </div>

            <div className={styles.row}>
              <FormField label="Tipo de viagem" required>
                {(field) => (
                  <Select
                    id={field.id}
                    aria-describedby={field.describedBy}
                    invalid={field.invalid}
                    value={tripType}
                    onChange={(event) => setTripType(event.target.value as TripType)}
                  >
                    <option value="ONE_WAY">Só ida</option>
                    <option value="ROUND_TRIP">Ida e volta</option>
                  </Select>
                )}
              </FormField>
              <FormField label="Moeda" required>
                {(field) => (
                  <Select
                    id={field.id}
                    aria-describedby={field.describedBy}
                    invalid={field.invalid}
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value)}
                  >
                    {SUPPORTED_CURRENCIES.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
            </div>

            <div className={styles.row}>
              <FormField label="Data de ida" required>
                {(field) => (
                  <TextInput
                    id={field.id}
                    aria-describedby={field.describedBy}
                    invalid={field.invalid}
                    type="date"
                    value={departureDate}
                    onChange={(event) => setDepartureDate(event.target.value)}
                  />
                )}
              </FormField>
              {tripType === 'ROUND_TRIP' && (
                <FormField label="Data de volta" required>
                  {(field) => (
                    <TextInput
                      id={field.id}
                      aria-describedby={field.describedBy}
                      invalid={field.invalid}
                      type="date"
                      value={returnDate}
                      onChange={(event) => setReturnDate(event.target.value)}
                    />
                  )}
                </FormField>
              )}
            </div>

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
                  value={targetPrice}
                  onChange={(event) => setTargetPrice(event.target.value)}
                />
              )}
            </FormField>

            {formError && <InlineAlert tone="danger">{formError}</InlineAlert>}

            <div className={styles.actions}>
              <Button type="button" variant="ghost" onClick={closeModal} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="submit" loading={isPending}>
                Confirmar monitoramento
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
