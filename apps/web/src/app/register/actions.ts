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
  INVALID_AUTH_INPUT: 'Alguns dados não são válidos — confira email e senha.',
};

export async function registerAction(input: {
  email: string;
  password: string;
  timezone: string;
}): Promise<RegisterActionResult> {
  let session;
  try {
    session = await register(input);
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
