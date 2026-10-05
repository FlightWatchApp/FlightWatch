import type { Metadata, Viewport } from 'next';
import { Instrument_Sans, JetBrains_Mono } from 'next/font/google';
import type { ReactElement, ReactNode } from 'react';
import { FlightTrails } from '@/components/brand/flight-trails';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import '@/styles/globals.css';

/** DS-03: Instrument Sans para tudo — títulos e texto. */
const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument-sans',
  display: 'swap',
});

/** DS-03: JetBrains Mono só para código IATA e código técnico (classe `.iata`). */
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

// BR-03: mesma variável que apps/api/src/auth/auth.service.ts já usa para
// links de e-mail — sem NEXT_PUBLIC_* nova (SPEC-021 §"Fora do escopo").
const WEB_BASE_URL = process.env.WEB_BASE_URL ?? 'http://localhost:3100';

const DESCRIPTION =
  'O Flight Watch observa o preço de rotas de voo e avisa quando ele cai. Monitoramento, promoções e histórico de preço — não vende nem emite passagens.';

export const metadata: Metadata = {
  metadataBase: new URL(WEB_BASE_URL),
  title: {
    default: 'Flight Watch — passagens observadas de perto',
    template: '%s · Flight Watch',
  },
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Flight Watch',
    title: 'Flight Watch — passagens observadas de perto',
    description: DESCRIPTION,
    images: [{ url: '/brand/og-image.png', width: 1200, height: 630, alt: 'Flight Watch' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // BR-03: igual a --fw-paper. Literal porque o Next exige valor fixo aqui
  // (única exceção a DS-01, registrada em scripts/design/check-tokens.mjs).
  themeColor: '#f5f3ee',
};

export default function RootLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <html lang="pt-BR" className={`${instrumentSans.variable} ${jetbrainsMono.variable}`}>
      <body>
        <FlightTrails />
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
