'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { logoutAction } from '@/app/logout/actions';
import { IconLogOut, IconMenu, IconX } from '@/components/ui/icon';
import { CreateWatchModal } from '@/components/watches/create-watch-modal';
import styles from './site-header.module.css';

interface NavItem {
  href: string;
  label: string;
  /** Prefixos de rota que também marcam o item como atual. */
  match: string[];
}

const PUBLIC_ITEMS: NavItem[] = [
  { href: '/opportunities', label: 'Promoções', match: ['/opportunities'] },
  { href: '/search', label: 'Buscar passagens', match: ['/search'] },
];

const MEMBER_ITEMS: NavItem[] = [
  { href: '/', label: 'Início', match: ['/'] },
  { href: '/watches', label: 'Monitoramentos', match: ['/watches'] },
  ...PUBLIC_ITEMS,
];

function isCurrent(pathname: string, item: NavItem): boolean {
  if (item.href === '/' && pathname === '/') return true;
  return item.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export interface MainNavProps {
  userEmail: string | null;
}

/**
 * CP-11: navegação principal. No desktop fica em linha; abaixo de 860 px vira
 * um painel aberto por botão (`aria-expanded`/`aria-controls`), fecha ao
 * trocar de rota e com Esc, com o foco voltando ao botão.
 */
export function MainNav({ userEmail }: MainNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const items = userEmail ? MEMBER_ITEMS : PUBLIC_ITEMS;

  // Fecha o painel ao navegar — ajuste de estado derivado da rota durante o
  // render (padrão documentado pelo React), não um efeito com setState.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <button
        ref={menuButtonRef}
        type="button"
        className={styles.menuButton}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <IconX size={22} /> : <IconMenu size={22} />}
        <span className="visually-hidden">{open ? 'Fechar menu' : 'Abrir menu'}</span>
      </button>

      <div id={panelId} className={`${styles.panel} ${open ? styles.panelOpen : ''}`}>
        <nav aria-label="Principal" className={styles.nav}>
          {items.map((item) => {
            const current = isCurrent(pathname, item);
            return (
              <Link
                key={item.href + item.label}
                href={item.href}
                className={`${styles.navLink} ${current ? styles.navLinkCurrent : ''}`}
                aria-current={current ? 'page' : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className={styles.session}>
          {userEmail ? (
            <>
              <CreateWatchModal triggerClassName={styles.cta} />
              <span className={styles.userEmail} title={userEmail}>
                {userEmail}
              </span>
              <form action={logoutAction}>
                <button type="submit" className={styles.sessionLink}>
                  <IconLogOut size={16} />
                  Sair
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className={styles.sessionLink}>
                Entrar
              </Link>
              <Link href="/register" className={styles.cta}>
                Criar conta grátis
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}
