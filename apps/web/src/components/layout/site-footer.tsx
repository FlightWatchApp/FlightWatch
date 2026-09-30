import { BrandMark } from '@/components/ui/brand-mark';
import styles from './site-footer.module.css';

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <BrandMark size={20} />
        <p className={styles.disclaimer}>
          Flight Watch monitora preços de voos e avisa quando eles caem. Não vende nem emite
          passagens.
        </p>
        <p className={styles.meta}>© {year} Flight Watch</p>
      </div>
    </footer>
  );
}
