import Link from 'next/link';
import { notFoundOn404 } from '../not-found-on-404';
import { listAdminUsers } from '@/lib/api/admin';
import { PeopleTable } from './people-table';
import styles from '../admin.module.css';

/** SPEC-043: cota do mês, monitoramentos ativos e acesso de cada pessoa. */
export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor } = await searchParams;
  const page = await listAdminUsers(cursor).catch(notFoundOn404);

  return (
    <section className={styles.section} aria-labelledby="people-list">
      <h2 id="people-list" className={styles.sectionTitle}>
        Pessoas
      </h2>
      <PeopleTable items={page.items} />
      {page.nextCursor && (
        <Link href={`/admin/pessoas?cursor=${page.nextCursor}`}>Próxima página →</Link>
      )}
    </section>
  );
}
