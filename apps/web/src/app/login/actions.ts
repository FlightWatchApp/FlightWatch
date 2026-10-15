'use server';

import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api/client';
import { login } from '@/lib/api/auth';
import { setSessionCookie } from '@/lib/auth/session';

export interface LoginActionResult {
  success: boolean;
  error?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Email ou senha incorretos.',
  ACCOUNT_LOCKED:
    'Conta temporariamente bloqueada por excesso de tentativas. Tente novamente mais tarde.',
  INVALID_AUTH_INPUT: 'Alguns dados não são válidos — confira email e senha.',
  RATE_LIMITED: 'Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.',
  CAPTCHA_REQUIRED: 'Confirme que você não é um robô e tente de novo.',
  CAPTCHA_FAILED: 'Não conseguimos confirmar que você não é um robô. Tente de novo.',
};

export async function loginAction(input: {
  email: string;
  password: string;
  /** SPEC-041: token do Turnstile, quando o captcha está ligado. */
  captchaToken?: string | undefined;
}): Promise<LoginActionResult> {
  let session;
  try {
    session = await login({
      email: input.email,
      password: input.password,
      ...(input.captchaToken ? { captchaToken: input.captchaToken } : {}),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        success: false,
        error: ERROR_MESSAGES[error.code ?? ''] ?? 'Não foi possível entrar. Tente novamente.',
      };
    }
    return { success: false, error: 'Não foi possível entrar. Tente novamente.' };
  }

  // redirect() lança internamente — precisa ficar fora do try/catch acima,
  // senão o catch-all engoliria o lançamento silenciosamente.
  await setSessionCookie(session.token, session.expiresAt);
  redirect('/');
}
