'use client';

import { useState, useTransition } from 'react';
import { PlaceCombobox } from '@/components/places/place-combobox';
import type { SelectedPlace } from '@/components/places/place-options';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { InlineAlert } from '@/components/ui/inline-alert';
import { updateHomeCityAction } from './actions';
import styles from './page.module.css';

/** SPEC-040: cidade de partida da conta — escolher, trocar ou remover. */
export function HomeCityForm({ initial }: { initial: SelectedPlace | null }) {
  const [city, setCity] = useState<SelectedPlace | null>(initial);
  const [saved, setSaved] = useState<SelectedPlace | null>(initial);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(next: SelectedPlace | null): void {
    setMessage(null);
    startTransition(() => {
      void (async () => {
        const result = await updateHomeCityAction(next?.code ?? null);
        if (result.success) {
          const value = result.homeCity ?? null;
          setSaved(value);
          setCity(value);
          setMessage({
            tone: 'success',
            text: value ? `Cidade salva: ${value.name}.` : 'Cidade removida da conta.',
          });
        } else {
          setMessage({ tone: 'danger', text: result.error ?? 'Não foi possível salvar.' });
        }
      })();
    });
  }

  return (
    <div className={styles.homeCity}>
      <FormField label="Cidade de partida">
        {(field) => (
          <PlaceCombobox
            id={field.id}
            aria-describedby={field.describedBy}
            invalid={field.invalid}
            value={city}
            onChange={setCity}
          />
        )}
      </FormField>
      <div className={styles.homeCityActions}>
        <Button
          type="button"
          size="sm"
          loading={isPending}
          disabled={!city || city.code === saved?.code}
          onClick={() => save(city)}
        >
          Salvar cidade
        </Button>
        {saved && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => save(null)}
          >
            Remover
          </Button>
        )}
      </div>
      {message && <InlineAlert tone={message.tone}>{message.text}</InlineAlert>}
    </div>
  );
}
