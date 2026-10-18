import Link from 'next/link';
import type { InviteState } from '@flight-watch/contracts';
import { listInvites } from '@/lib/api/admin';
import { InviteForm } from './invite-form';
import { InviteTable } from './invite-table';
import styles from '../admin.module.css';

const FILTERS: Array<{ state: InviteState | undefined; label: string }> = [
  { state: undefined, label: 'Todas' },
  { state: 'AVAILABLE', label: 'Disponíveis' },
  { state: 'REDEEMED', label: 'Usadas' },
  { state: 'EXPIRED', label: 'Vencidas' },
  { state: 'REVOKED', label: 'Revogadas' },
];

/** SPEC-043: gerar, listar e revogar chaves de convite. */
export default async function InvitesPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; cursor?: string }>;
}) {
  const { state, cursor } = await searchParams;
  const activeState = FILTERS.find((filter) => filter.state === state)?.state;
  const page = await listInvites({ state: activeState, cursor });

  return (
    <div className={styles.section}>
      <InviteForm />

      <section className={styles.section} aria-labelledby="invites-list">
        <h2 id="invites-list" className={styles.sectionTitle}>
          Chaves
        </h2>
        <nav aria-label="Filtrar por estado" className={styles.filters}>
          {FILTERS.map((filter) => (
            <Link
              key={filter.label}
              href={filter.state ? `/admin/convites?state=${filter.state}` : '/admin/convites'}
              aria-current={filter.state === activeState ? 'page' : undefined}
            >
              {filter.label}
            </Link>
          ))}
        </nav>
        <InviteTable items={page.items} />
        {page.nextCursor && (
          <Link
            href={`/admin/convites?${new URLSearchParams({
              ...(activeState ? { state: activeState } : {}),
              cursor: page.nextCursor,
            })}`}
          >
            Próxima página →
          </Link>
        )}
      </section>
    </div>
  );
}
