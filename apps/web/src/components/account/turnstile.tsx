'use client';

import { useEffect, useRef } from 'react';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
      language?: string;
      theme?: 'auto' | 'light' | 'dark';
    },
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

/** Carrega o script da Cloudflare uma vez por página. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing'));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('turnstile script failed'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export interface TurnstileProps {
  siteKey: string;
  /** Token novo, ou `null` quando expirou ou deu erro (o envio fica bloqueado). */
  onToken: (token: string | null) => void;
}

/**
 * SPEC-041: widget do Cloudflare Turnstile. O token vale uma vez: quem usa
 * troca a `key` do componente para recomeçar depois de uma tentativa.
 */
export function Turnstile({ siteKey, onToken }: TurnstileProps) {
  const container = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current) return;
        widgetId = turnstile.render(container.current, {
          sitekey: siteKey,
          callback: (token) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
          language: 'pt-br',
          theme: 'auto',
        });
      })
      .catch(() => onTokenRef.current(null));
    return () => {
      cancelled = true;
      if (widgetId !== null) window.turnstile?.remove(widgetId);
    };
  }, [siteKey]);

  return <div ref={container} data-testid="turnstile" />;
}
