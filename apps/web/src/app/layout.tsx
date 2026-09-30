import type { Metadata, Viewport } from 'next';
import { Fraunces, IBM_Plex_Mono, Public_Sans } from 'next/font/google';
import type { ReactElement, ReactNode } from 'react';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import '@/styles/globals.css';

const displayFont = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  axes: ['opsz', 'SOFT'],
  display: 'swap',
});

const bodyFont = Public_Sans({
  subsets: ['latin'],
  variable: '--font-public-sans',
  display: 'swap',
});

const monoFont = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Flight Watch — observação de preços de voos',
    template: '%s · Flight Watch',
  },
  description:
    'Configure uma intenção de viagem e receba um alerta quando o preço observado atender às suas condições. Flight Watch monitora, não vende nem emite passagens.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b1e3d',
};

export default function RootLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <html
      lang="pt-BR"
      className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}
    >
      <body>
        <a className="skip-link" href="#main-content">
          Pular para o conteúdo
        </a>
        <SiteHeader />
        <main id="main-content">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
