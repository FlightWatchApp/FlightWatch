import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { getCurrentUser } from '@/lib/api/auth';
import styles from './admin.module.css';

export const metadata: Metadata = { title: 'Administração', robots: { index: false } };

/**
 * SPEC-043: quem não é admin vê o 404 do site (não revela que a área existe).
 * É conferência de interface — a barreira real é o AdminGuard da API.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    notFound();
  }

  return (
    <div className={`container ${styles.page}`}>
      <h1>Administração</h1>
      <nav aria-label="Administração" className={styles.tabs}>
        <Link href="/admin/convites">Convites</Link>
        <Link href="/admin/pessoas">Pessoas</Link>
        <Link href="/admin/mensagens">Mensagens</Link>
      </nav>
      {children}
    </div>
  );
}
