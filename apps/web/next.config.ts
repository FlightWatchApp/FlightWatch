import type { NextConfig } from 'next';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Política de conteúdo: tudo do próprio site, exceto as imagens dos mapas
 * (tiles do OpenStreetMap, SPEC-016/033). `unsafe-inline` em script é exigido
 * pelos scripts de inicialização do Next sem nonce; `unsafe-eval` só em
 * desenvolvimento (recarregamento a quente). O JSON-LD da página da rota
 * (`application/ld+json`) não é executado, então não depende de script-src.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
  "font-src 'self' data:",
  `connect-src 'self'${isProduction ? '' : ' ws:'}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  // HTTPS obrigatório por 1 ano; só faz efeito quando servido por HTTPS.
  ...(isProduction
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Não anunciar a tecnologia do servidor ("X-Powered-By: Next.js").
  poweredByHeader: false,
  // Governança de agentes de IA já vive em AGENTS.md;
  // evita um AGENTS.md/CLAUDE.md duplicado e divergente gerado em apps/web.
  agentRules: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
