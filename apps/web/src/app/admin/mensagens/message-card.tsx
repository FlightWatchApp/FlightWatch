'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import styles from '../admin.module.css';

/** SPEC-045 parte B: a mensagem pronta, com o botão de copiar. Nada é enviado. */
export function MessageCard({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className={styles.messageCard} aria-label={title}>
      <pre className={styles.messageText}>{text}</pre>
      <Button size="sm" variant="secondary" onClick={() => void copy()}>
        {copied ? 'Copiada' : 'Copiar mensagem'}
      </Button>
    </article>
  );
}
