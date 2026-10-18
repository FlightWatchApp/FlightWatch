'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import styles from '../admin.module.css';

/** Mostra a chave uma vez (SPEC-043); não dá para ver de novo depois de fechar. */
export function InviteCodeBox({
  email,
  code,
  emailSent,
  onClose,
}: {
  email: string;
  code: string;
  emailSent: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <InlineAlert tone="success" title={`Chave para ${email}`}>
      <div className={styles.section}>
        <div className={styles.codeBox}>
          <span>{code}</span>
          <Button size="sm" variant="secondary" onClick={() => void copy()}>
            {copied ? 'Copiada' : 'Copiar'}
          </Button>
        </div>
        <p className={styles.muted}>
          {emailSent
            ? 'Enviamos o e-mail com o link de cadastro.'
            : 'Não conseguimos enviar o e-mail — mande a chave por outro meio ou gere outra.'}{' '}
          Não dá para ver essa chave de novo; se perder, gere outra.
        </p>
        <div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </InlineAlert>
  );
}
