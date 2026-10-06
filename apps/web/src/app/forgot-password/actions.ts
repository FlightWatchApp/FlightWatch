'use server';

import { requestPasswordReset } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';

export interface ForgotPasswordActionResult {
  success: boolean;
  error?: string;
}

/**
 * SPEC-026: o sucesso não diz se a conta existe — a tela mostra sempre a
 * mesma mensagem. Só erros de entrada ou de limite aparecem como erro.
 */
export async function forgotPasswordAction(input: {
  email: string;
}): Promise<ForgotPasswordActionResult> {
  try {
    await requestPasswordReset(input.email);
    return { success: true };
  } catch (error) {
    if (error instanceof ApiError && error.code === 'INVALID_AUTH_INPUT') {
      return { success: false, error: 'Confira o email informado.' };
    }
    if (error instanceof ApiError && error.code === 'RATE_LIMITED') {
      return {
        success: false,
        error: 'Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.',
      };
    }
    return { success: false, error: 'Não foi possível enviar agora. Tente novamente.' };
  }
}
