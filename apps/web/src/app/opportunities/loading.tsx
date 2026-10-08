import { Skeleton } from '@/components/ui/skeleton';
import styles from './page.module.css';

/** SPEC-032 AC-9: "carregando" é um estado próprio — uma origem fria consulta a fonte. */
export default function OpportunitiesLoading() {
  return (
    <div className={`container ${styles.page}`} aria-busy="true">
      <p className={styles.eyebrow}>Calculando promoções…</p>
      <Skeleton height="4rem" />
      <Skeleton height="14rem" />
      <Skeleton height="14rem" />
    </div>
  );
}
