'use server';

import { resendVerification } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';

export interface ResendVerificationResult {
  success: boolean;
  error?: string;
}

export async function resendVerificationAction(): Promise<ResendVerificationResult> {
  try {
    await resendVerification();
    return { success: true };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return { success: false, error: 'Sua sessão expirou — entre novamente.' };
    }
    return { success: false, error: 'Não foi possível reenviar o e-mail agora.' };
  }
}
