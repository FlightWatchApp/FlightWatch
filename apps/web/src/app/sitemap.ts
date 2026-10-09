import type { MetadataRoute } from 'next';
import { listSitemapRoutes } from '@/lib/api/routes';
import { routePagesEnabled } from '@/lib/domain/route-flag';
import { routePath } from '@/lib/domain/route-url';

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? 'http://localhost:3100';

// A lista vem da API, que já guarda em cache (ROUTE_SITEMAP_TTL_MINUTES).
export const dynamic = 'force-dynamic';

/**
 * SPEC-033 §SEO: páginas públicas fixas e as páginas de rota com preço, só
 * em URL canônica. Áreas privadas ficam fora (e bloqueadas no robots).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = ['/', '/opportunities', '/transparencia'].map((path) => ({
    url: `${WEB_BASE_URL}${path}`,
  }));
  if (!routePagesEnabled()) return pages;
  try {
    const { routes, generatedAt } = await listSitemapRoutes();
    return [
      ...pages,
      ...routes.map((route) => ({
        url: `${WEB_BASE_URL}${routePath(route.origin, route.destination)}`,
        lastModified: generatedAt,
      })),
    ];
  } catch {
    // API fora: o sitemap sai só com as páginas fixas, nunca com erro.
    return pages;
  }
}
