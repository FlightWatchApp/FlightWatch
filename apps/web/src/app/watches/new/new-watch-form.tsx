'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Select } from '@/components/ui/select';
import { TextInput } from '@/components/ui/text-input';
import { parseAmountMinor } from '@/lib/domain/money';
import type { TripType } from '@/lib/api/types';
import { createWatchAction } from './actions';
import styles from './page.module.css';

// Espelha apps/api/src/watches/supported-catalog.ts — ainda não é config
// compartilhada (placeholder até o ADR-004 definir o provedor real).
const SUPPORTED_AIRPORTS = ['DOU', 'GRU', 'GIG', 'CGH', 'BSB', 'JFK', 'MIA'];
const SUPPORTED_CURRENCIES = ['BRL', 'USD'];

export function NewWatchForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const [origin, setOrigin] = useState(SUPPORTED_AIRPORTS[0] ?? '');
  const [destination, setDestination] = useState(SUPPORTED_AIRPORTS[1] ?? '');
  const [tripType, setTripType] = useState<TripType>('ONE_WAY');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [currency, setCurrency] = useState(SUPPORTED_CURRENCIES[0] ?? '');
  const [targetPrice, setTargetPrice] = useState('');

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
    const targetAmountMinor = parseAmountMinor(targetPrice);
    if (targetAmountMinor === null) {
      setFormError('Informe um preço-alvo válido, maior que zero.');
      return;
    }

    startTransition(() => {
      void (async () => {
        const result = await createWatchAction({
          origin,
          destination,
          tripType,
          departureDate,
          returnDate: tripType === 'ROUND_TRIP' ? returnDate : null,
          currency,
          market: 'BR',
          targetAmountMinor,
        });
        if (result.success) {
          router.push('/');
          router.refresh();
        } else {
          setFormError(result.error ?? 'Não foi possível criar o monitoramento.');
        }
      })();
    });
  }

  return (
    <div className={`container ${styles.page}`}>
      <Link href="/" className={styles.back}>
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
                <Select
                  id={field.id}
                  aria-describedby={field.describedBy}
                  invalid={field.invalid}
                  value={origin}
                  onChange={(event) => setOrigin(event.target.value)}
                >
                  {SUPPORTED_AIRPORTS.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
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
                      {code}
                    </option>
                  ))}
                </Select>
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
          </div>

          {formError && <InlineAlert tone="danger">{formError}</InlineAlert>}

          <div className={styles.actions}>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Criando…' : 'Criar monitoramento'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
