'use client';

import { useEffect, useId, useRef } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { IconButton } from './icon-button';
import { IconX } from './icon';
import styles from './modal.module.css';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'default' | 'wide';
}

/**
 * Usa <dialog> nativo: o navegador cuida de trap de foco, fechar com Esc e da
 * camada de topo — evita reimplementar isso à mão de forma incompleta.
 */
export function Modal({ open, title, onClose, children, size = 'default' }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) {
      onClose();
    }
  }

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- clique no backdrop é um atalho de mouse adicional; Esc (onCancel) e o botão "Fechar" já cobrem o fechamento por teclado.
    <dialog
      ref={dialogRef}
      className={`${styles.dialog} ${size === 'wide' ? styles.wide : ''}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={handleBackdropClick}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className={styles.body}>
        <div className={styles.header}>
          <h2 className={styles.title} id={titleId}>
            {title}
          </h2>
          <IconButton icon={<IconX size={18} />} aria-label="Fechar" onClick={onClose} />
        </div>
        {children}
      </div>
    </dialog>
  );
}
