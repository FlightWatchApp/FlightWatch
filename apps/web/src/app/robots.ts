import type { MetadataRoute } from 'next';

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? 'http://localhost:3100';

/** SPEC-033 §SEO: áreas privadas e resultados de busca fora do índice. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/watches', '/account', '/search', '/api'],
    },
    sitemap: `${WEB_BASE_URL}/sitemap.xml`,
  };
}
