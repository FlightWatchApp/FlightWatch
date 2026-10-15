'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { deleteAccount } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { updateHomeCity } from '@/lib/api/me';
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

export interface HomeCityActionResult {
  success: boolean;
  homeCity?: { code: string; name: string } | null;
  error?: string;
}

/** SPEC-040: cidade de partida da conta (null remove). */
export async function updateHomeCityAction(code: string | null): Promise<HomeCityActionResult> {
  try {
    const result = await updateHomeCity(code);
    revalidatePath('/', 'layout');
    return { success: true, homeCity: result.homeCity };
  } catch (error) {
    if (error instanceof ApiError && error.code === 'UNSUPPORTED_CITY') {
      return { success: false, error: 'Escolha uma cidade da lista.' };
    }
    if (error instanceof ApiError && error.code === 'RATE_LIMITED') {
      return {
        success: false,
        error: 'Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.',
      };
    }
    return { success: false, error: 'Não foi possível salvar a cidade agora.' };
  }
}
