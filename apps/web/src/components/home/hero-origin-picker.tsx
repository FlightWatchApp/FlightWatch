'use client';

import { useState, useTransition } from 'react';
import { chooseHomeOriginAction } from '@/app/opportunities/origin-actions';
import { PlaceCombobox } from '@/components/places/place-combobox';
import type { SelectedPlace } from '@/components/places/place-options';
import { FormField } from '@/components/ui/form-field';
import styles from './landing.module.css';

/**
 * SPEC-032: a cidade de partida é escolhida no próprio cartão da página
 * inicial — a mesma preferência (cookie) de /opportunities. Escolher recarrega
 * a página com a promoção real; nunca uma origem inventada.
 */
export function HeroOriginPicker({
  origin,
  noPromotion,
  suggested = false,
}: {
  origin: SelectedPlace | null;
  /** Cidade escolhida, mas sem promoção saindo dela agora (ou feed fora). */
  noPromotion: boolean;
  /** SPEC-034: a cidade veio do acesso (não foi escolhida nem gravada). */
  suggested?: boolean;
}) {
  const [value, setValue] = useState<SelectedPlace | null>(origin);
  const [isPending, startTransition] = useTransition();

  function handleChange(place: SelectedPlace | null): void {
    setValue(place);
    if (place && place.code !== origin?.code) {
      startTransition(() => chooseHomeOriginAction(place.code));
    }
  }

  const hint = suggested
    ? noPromotion
      ? 'Sugerida pelo seu acesso, mas sem promoção saindo dela agora. Troque se quiser.'
      : 'Sugerida pelo seu acesso — troque se quiser.'
    : noPromotion
      ? 'Nenhuma promoção saindo da sua cidade agora; o cartão mostra um exemplo.'
      : origin
        ? 'Troque a cidade para ver as promoções saindo de outro lugar.'
        : 'Escolha de onde você sai para ver as promoções a partir da sua cidade.';

  return (
    <div className={styles.heroPicker} aria-busy={isPending}>
      <FormField label="Saindo de" hint={hint} required>
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
