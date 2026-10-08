'use client';

import { useState, useTransition } from 'react';
import { PlaceCombobox } from '@/components/places/place-combobox';
import type { SelectedPlace } from '@/components/places/place-options';
import { FormField } from '@/components/ui/form-field';
import { chooseOriginAction } from './origin-actions';
import styles from './page.module.css';

/** SPEC-032: a pessoa escolhe de onde sai — nunca uma origem inventada. */
export function OriginPicker({ origin }: { origin: SelectedPlace | null }) {
  const [value, setValue] = useState<SelectedPlace | null>(origin);
  const [isPending, startTransition] = useTransition();

  function handleChange(place: SelectedPlace | null): void {
    setValue(place);
    if (place && place.code !== origin?.code) {
      startTransition(() => chooseOriginAction(place.code));
    }
  }

  return (
    <div className={styles.originPicker} aria-busy={isPending}>
      <FormField label="Saindo de" hint="Mostramos as promoções a partir desta cidade." required>
        {(field) => (
          <PlaceCombobox
            id={field.id}
            aria-describedby={field.describedBy}
            value={value}
            onChange={handleChange}
            placeholder="Sua cidade de partida"
          />
        )}
      </FormField>
    </div>
  );
}
