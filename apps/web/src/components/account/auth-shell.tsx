import type { ReactNode } from 'react';
import { BrandSymbol } from '@/components/brand/brand-symbol';
import { IconBell, IconRoute, IconShield } from '@/components/ui/icon';
import styles from './auth-shell.module.css';

export interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

// Mesmos três fatos que o produto já cumpre hoje (packages/domain + SPEC-003/005/018),
// na mesma voz de components/home/landing.tsx — nada prometido aqui que a home não diga.
const BENEFITS = [
  { Icon: IconRoute, text: 'Preço com histórico, não só o de hoje.' },
  { Icon: IconBell, text: 'Um e-mail quando o preço desejado for atingido.' },
  { Icon: IconShield, text: 'Compra direto no site parceiro, sem intermediação.' },
];

/**
 * CP-13: painel da marca (>= 960px, à esquerda) + formulário (à direita).
 * Abaixo de 960px só o formulário aparece — o painel é decorativo, por isso
 * sai inteiro da árvore de acessibilidade (`aria-hidden`), igual a
 * `HeroIllustration` (CP-14).
 */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className={styles.shell}>
      <div className={styles.brandPanel} aria-hidden="true">
        <BrandSymbol size={40} variant="plain" animated />
        <p className={styles.brandTagline}>Passagens observadas de perto.</p>
        <ul className={styles.benefits}>
          {BENEFITS.map(({ Icon, text }) => (
            <li key={text}>
              <Icon size={18} />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.formPanel}>
        <div className={styles.formInner}>
          <div>
            <h1>{title}</h1>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          {children}
          {footer && <div className={styles.footer}>{footer}</div>}
        </div>
      </div>
    </div>
  );
}
