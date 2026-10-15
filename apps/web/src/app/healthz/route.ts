import { healthResponse } from '@/lib/health';

export const dynamic = 'force-dynamic';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';

export function GET(): Promise<Response> {
  return healthResponse(API_BASE_URL);
}
