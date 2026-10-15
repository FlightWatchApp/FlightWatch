import { proxyStatsScript } from '@/lib/stats-proxy';

export const dynamic = 'force-dynamic';

export function GET(): Promise<Response> {
  return proxyStatsScript(process.env.UMAMI_INTERNAL_URL);
}
