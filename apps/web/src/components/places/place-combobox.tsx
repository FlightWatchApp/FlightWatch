'use client';

import { type KeyboardEvent, useId, useRef, useState } from 'react';
import { TextInput } from '@/components/ui/text-input';
import type { Place } from '@/lib/api/types';
import { searchPlacesAction } from './actions';
import {
  type SelectedPlace,
  formatPlaceLabel,
  moveActiveIndex,
  placeOptionDetail,
  textForValueChange,
} from './place-options';
import styles from './place-combobox.module.css';

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

type Status = 'idle' | 'loading' | 'ready' | 'failed';

export interface PlaceComboboxProps {
  id: string;
  value: SelectedPlace | null;
  onChange: (place: SelectedPlace | null) => void;
  'aria-describedby'?: string | undefined;
  invalid?: boolean | undefined;
  placeholder?: string;
}

/**
 * SPEC-029 AC-9: escolha de cidade pelo nome, padrão ARIA combobox com
 * listbox. Digitar de novo depois de escolher limpa a escolha. Respostas
 * fora de ordem são descartadas (só vale a da última busca disparada).
 */
export function PlaceCombobox({
  id,
  value,
  onChange,
  'aria-describedby': describedBy,
  invalid,
  placeholder = 'Cidade ou aeroporto',
}: PlaceComboboxProps) {
  const listboxId = useId();
  const [text, setText] = useState(value ? formatPlaceLabel(value) : '');
  const [options, setOptions] = useState<Place[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const latestRequest = useRef(0);
  const [syncedValue, setSyncedValue] = useState(value);

  // Valor trocado por fora (ex.: botão de inverter origem e destino). Ajuste
  // durante o render, padrão do React para estado derivado de prop. Ao
  // digitar, o campo já limpou a escolha e o texto não bate mais com o rótulo
  // anterior: o texto digitado fica. Limpeza vinda de fora apaga o texto.
  if (value?.code !== syncedValue?.code) {
    setSyncedValue(value);
    const nextText = textForValueChange(syncedValue, value, text);
    if (nextText !== null) setText(nextText);
  }

  function search(query: string): void {
    const requestId = ++latestRequest.current;
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setOptions([]);
      setStatus('idle');
      return;
    }
    setStatus('loading');
    window.setTimeout(() => {
      if (requestId !== latestRequest.current) return;
      void searchPlacesAction(query).then((result) => {
        if (requestId !== latestRequest.current) return;
        setOptions(result.places);
        setActiveIndex(result.places.length > 0 ? 0 : -1);
        setStatus(result.failed ? 'failed' : 'ready');
      });
    }, DEBOUNCE_MS);
  }

  function choose(place: Place): void {
    onChange({ code: place.code, name: place.name });
    setText(formatPlaceLabel(place));
    setOpen(false);
    setOptions([]);
    setStatus('idle');
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        moveActiveIndex(current, event.key === 'ArrowDown' ? 1 : -1, options.length),
      );
    } else if (event.key === 'Enter' && open && activeIndex >= 0) {
      const place = options[activeIndex];
      if (place) {
        event.preventDefault();
        choose(place);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const activeId = activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined;
  const showList = open && status !== 'idle';

  return (
    <div className={styles.combobox}>
      <TextInput
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-activedescendant={showList ? activeId : undefined}
        aria-describedby={describedBy}
        invalid={invalid ?? false}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          if (value) onChange(null);
          search(event.target.value);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
      />
      <ul
        id={listboxId}
        role="listbox"
        aria-label="Cidades encontradas"
        className={styles.listbox}
        hidden={!showList}
      >
        {status === 'loading' && options.length === 0 && (
          <li className={styles.message} role="presentation">
            Buscando…
          </li>
        )}
        {status === 'ready' && options.length === 0 && (
          <li className={styles.message} role="presentation">
            Nenhuma cidade com voos encontrada.
          </li>
        )}
        {status === 'failed' && (
          <li className={styles.message} role="presentation">
            Não foi possível buscar agora. Tente de novo.
          </li>
        )}
        {options.map((place, index) => (
          <li
            key={place.code}
            id={`${listboxId}-${index}`}
            role="option"
            aria-selected={index === activeIndex}
            className={`${styles.option} ${index === activeIndex ? styles.active : ''}`}
            // mousedown (e não click): escolhe antes do blur fechar a lista.
            onMouseDown={(event) => {
              event.preventDefault();
              choose(place);
            }}
            onMouseEnter={() => setActiveIndex(index)}
          >
            <span className={styles.name}>
              {place.name} <span className="iata">{place.code}</span>
            </span>
            <span className={styles.detail}>{placeOptionDetail(place)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
