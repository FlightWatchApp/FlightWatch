import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api/client';

/**
 * SPEC-043: o layout e a página renderizam em paralelo; para quem não é admin a
 * API responde 404 e a página mostra o 404 do site (sem erro no log).
 */
export function notFoundOn404(error: unknown): never {
  if (error instanceof ApiError && error.status === 404) {
    notFound();
  }
  throw error;
}
