'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { IconSearch, IconSwap } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Select } from '@/components/ui/select';
import { TextInput } from '@/components/ui/text-input';
import type { TripType } from '@/lib/api/types';
import { airportLabel } from '@/lib/domain/airport-coordinates';
import { searchFlightsAction } from './actions';
import styles from './page.module.css';

// Espelha apps/api/src/watches/supported-catalog.ts — mesmo placeholder já
// usado em apps/web/src/app/watches/new/new-watch-form.tsx.
const SUPPORTED_AIRPORTS = ['DOU', 'GRU', 'GIG', 'CGH', 'BSB', 'JFK', 'MIA'];
const SUPPORTED_CURRENCIES = ['BRL', 'USD'];

export function SearchForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const [origin, setOrigin] = useState(SUPPORTED_AIRPORTS[0] ?? '');
  const [destination, setDestination] = useState(SUPPORTED_AIRPORTS[1] ?? '');
  const [tripType, setTripType] = useState<TripType>('ONE_WAY');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [currency, setCurrency] = useState(SUPPORTED_CURRENCIES[0] ?? '');

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFormError(null);

    if (!origin || !destination || origin === destination) {
      setFormError('Origem e destino precisam ser diferentes.');
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
        const result = await searchFlightsAction({
          origin,
          destination,
          tripType,
          departureDate,
          returnDate: tripType === 'ROUND_TRIP' ? returnDate : null,
          currency,
          market: 'BR',
          maxStops: null,
          maxPriceMinor: null,
        });
        if (result.success && result.id) {
          router.push(`/search?searchId=${result.id}#search-results`);
        } else {
          setFormError(result.error ?? 'Não foi possível buscar. Tente novamente.');
        }
      })();
    });
  }

  function swapRoute(): void {
    setOrigin(destination);
    setDestination(origin);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.routeRow}>
        <FormField label="Origem" required>
          {(field) => (
            <Select
              id={field.id}
              aria-describedby={field.describedBy}
              invalid={field.invalid}
              value={origin}
              onChange={(event) => setOrigin(event.target.value)}
            >
              {SUPPORTED_AIRPORTS.map((code) => (
                <option key={code} value={code}>
                  {airportLabel(code)}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <IconButton
          type="button"
          className={styles.swap}
          icon={<IconSwap />}
          aria-label="Inverter origem e destino"
          onClick={swapRoute}
        />
        <FormField label="Destino" required>
          {(field) => (
            <Select
              id={field.id}
              aria-describedby={field.describedBy}
              invalid={field.invalid}
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
            >
              {SUPPORTED_AIRPORTS.map((code) => (
                <option key={code} value={code}>
                  {airportLabel(code)}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      </div>

      <div className={styles.detailsRow}>
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

      {formError && <InlineAlert tone="danger">{formError}</InlineAlert>}

      <Button
        type="submit"
        size="lg"
        loading={isPending}
        disabled={isPending}
        leadingIcon={<IconSearch size={18} />}
        className={styles.submit}
      >
        {isPending ? 'Buscando passagens…' : 'Buscar passagens'}
      </Button>
    </form>
  );
}
