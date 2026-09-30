'use client';

import type { ReactNode } from 'react';
import { Button } from './button';
import { Modal } from './modal';
import styles from './modal.module.css';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  tone = 'default',
  isConfirming = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <div className={styles.description}>{description}</div>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onCancel} disabled={isConfirming}>
          {cancelLabel}
        </Button>
        <Button
          variant={tone === 'danger' ? 'destructive' : 'primary'}
          onClick={onConfirm}
          disabled={isConfirming}
        >
          {isConfirming ? 'Aguarde…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
