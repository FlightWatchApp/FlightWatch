'use server';

import { redirect } from 'next/navigation';
import { deleteAccount } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { clearSessionCookie } from '@/lib/auth/session';

export interface DeleteAccountActionResult {
  success: boolean;
  error?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Senha incorreta.',
  ACCOUNT_LOCKED:
    'Conta temporariamente bloqueada por excesso de tentativas. Tente novamente mais tarde.',
  UNAUTHENTICATED: 'Sua sessão expirou — entre novamente.',
  RATE_LIMITED: 'Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.',
};

/** SPEC-027: sucesso apaga o cookie de sessão e leva à confirmação. */
export async function deleteAccountAction(input: {
  password: string;
}): Promise<DeleteAccountActionResult> {
  try {
    await deleteAccount(input.password);
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        success: false,
        error: ERROR_MESSAGES[error.code ?? ''] ?? 'Não foi possível excluir a conta agora.',
      };
    }
    return { success: false, error: 'Não foi possível excluir a conta agora.' };
  }

  // redirect() lança internamente — fica fora do try/catch.
  await clearSessionCookie();
  redirect('/account/deleted');
}
