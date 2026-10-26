'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { PlaceCombobox } from '@/components/places/place-combobox';
import type { SelectedPlace } from '@/components/places/place-options';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Select } from '@/components/ui/select';
import { TextInput } from '@/components/ui/text-input';
import type { TripType } from '@/lib/api/types';
import { LowPricePreview } from '@/components/watches/low-price-preview';
import { createWatchAction } from './actions';
import styles from './page.module.css';

// Moedas aceitas pela API — decisão de negócio. Cidades vêm do catálogo (SPEC-029).
const SUPPORTED_CURRENCIES = ['BRL', 'USD'];

/** SPEC-040: `initialOrigin` é a cidade de partida da conta, já preenchida. */
export function NewWatchForm({
  initialOrigin = null,
  initialDestination = null,
  initialTripType = 'ONE_WAY',
  initialDepartureDate = '',
  initialReturnDate = '',
  quota = null,
}: {
  initialOrigin?: SelectedPlace | null;
  /** SPEC-045: viagem vinda da busca ("Monitorar esta viagem"). */
  initialDestination?: SelectedPlace | null;
  initialTripType?: TripType;
  initialDepartureDate?: string;
  initialReturnDate?: string;
  /** SPEC-043: "3 de 5 neste mês", ou null sem limite. */
  quota?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const [origin, setOrigin] = useState<SelectedPlace | null>(initialOrigin);
  const [destination, setDestination] = useState<SelectedPlace | null>(initialDestination);
  const [tripType, setTripType] = useState<TripType>(initialTripType);
  const [departureDate, setDepartureDate] = useState(initialDepartureDate);
  const [returnDate, setReturnDate] = useState(initialReturnDate);
  const [currency, setCurrency] = useState(SUPPORTED_CURRENCIES[0] ?? '');

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
        });
        if (result.success) {
          router.push('/watches');
          router.refresh();
        } else {
          setFormError(result.error ?? 'Não foi possível criar o monitoramento.');
        }
      })();
    });
  }

  return (
    <div className={`container ${styles.page}`}>
      <Link href="/watches" className={styles.back}>
        ← Voltar
      </Link>
      <div>
        <h1>Novo monitoramento</h1>
        <p className={styles.subtitle}>
          Escolha a rota e as datas. Você recebe um e-mail quando observarmos um preço bem abaixo do
          normal para essa viagem — sem precisar adivinhar um valor.
        </p>
        {quota && <p className={styles.subtitle}>Você usou {quota}.</p>}
      </div>

      <Card>
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
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

          <div className={styles.row}>
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

          <LowPricePreview
            origin={origin?.code ?? null}
            destination={destination?.code ?? null}
            tripType={tripType}
            departureDate={departureDate}
            returnDate={returnDate}
            currency={currency}
          />

          {formError && <InlineAlert tone="danger">{formError}</InlineAlert>}

          <div className={styles.actions}>
            <Button
              type="submit"
              size="lg"
              loading={isPending}
              data-umami-event="criar-monitoramento"
            >
              Criar monitoramento
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
