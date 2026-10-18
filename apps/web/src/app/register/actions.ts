'use server';

import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api/client';
import { register } from '@/lib/api/auth';
import { setSessionCookie } from '@/lib/auth/session';

export interface RegisterActionResult {
  success: boolean;
  error?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  EMAIL_ALREADY_REGISTERED: 'Já existe uma conta com esse email.',
  INVITE_INVALID:
    'Chave de acesso inválida, vencida ou já usada. Confira o e-mail em que você recebeu a chave.',
  INVALID_AUTH_INPUT: 'Alguns dados não são válidos — confira email e senha.',
  RATE_LIMITED: 'Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.',
  CAPTCHA_REQUIRED: 'Confirme que você não é um robô e tente de novo.',
  CAPTCHA_FAILED: 'Não conseguimos confirmar que você não é um robô. Tente de novo.',
};

export async function registerAction(input: {
  email: string;
  password: string;
  timezone: string;
  /** SPEC-041: token do Turnstile, quando o captcha está ligado. */
  captchaToken?: string | undefined;
  /** SPEC-043: chave de convite, quando o cadastro a exige. */
  inviteCode?: string | undefined;
}): Promise<RegisterActionResult> {
  let session;
  try {
    session = await register({
      email: input.email,
      password: input.password,
      timezone: input.timezone,
      ...(input.captchaToken ? { captchaToken: input.captchaToken } : {}),
      ...(input.inviteCode ? { inviteCode: input.inviteCode } : {}),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        success: false,
        error:
          ERROR_MESSAGES[error.code ?? ''] ?? 'Não foi possível criar sua conta. Tente novamente.',
      };
    }
    return { success: false, error: 'Não foi possível criar sua conta. Tente novamente.' };
  }

  // redirect() lança internamente — fora do try/catch acima, mesma razão de login/actions.ts.
  await setSessionCookie(session.token, session.expiresAt);
  redirect('/');
}
