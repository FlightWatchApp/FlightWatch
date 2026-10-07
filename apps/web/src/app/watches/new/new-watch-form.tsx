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
import { parseAmountMinor } from '@/lib/domain/money';
import type { TripType } from '@/lib/api/types';
import { createWatchAction } from './actions';
import styles from './page.module.css';

// Moedas aceitas pela API — decisão de negócio. Cidades vêm do catálogo (SPEC-029).
const SUPPORTED_CURRENCIES = ['BRL', 'USD'];

export function NewWatchForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const [origin, setOrigin] = useState<SelectedPlace | null>(null);
  const [destination, setDestination] = useState<SelectedPlace | null>(null);
  const [tripType, setTripType] = useState<TripType>('ONE_WAY');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [currency, setCurrency] = useState(SUPPORTED_CURRENCIES[0] ?? '');
  const [targetPrice, setTargetPrice] = useState('');

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
          Configure a rota, as datas e o preço que você quer acompanhar. Você recebe um alerta por
          e-mail quando a condição for atendida.
        </p>
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
          </div>

          {formError && <InlineAlert tone="danger">{formError}</InlineAlert>}

          <div className={styles.actions}>
            <Button type="submit" size="lg" loading={isPending}>
              Criar monitoramento
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
