import { proxyStatsEvent } from '@/lib/stats-proxy';

export const dynamic = 'force-dynamic';

export function POST(request: Request): Promise<Response> {
  return proxyStatsEvent(request, process.env.UMAMI_INTERNAL_URL);
}
