'use server';

import { confirmPasswordReset } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';

export interface ResetPasswordActionResult {
  success: boolean;
  error?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_RESET_TOKEN: 'Este link não é válido ou já foi usado. Peça um novo.',
  RESET_TOKEN_EXPIRED: 'Este link expirou. Peça um novo.',
  INVALID_AUTH_INPUT: 'A senha precisa ter entre 10 e 256 caracteres.',
  RATE_LIMITED: 'Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.',
};

/** SPEC-026: sucesso encerra todas as sessões da conta, inclusive esta. */
export async function resetPasswordAction(input: {
  token: string;
  password: string;
}): Promise<ResetPasswordActionResult> {
  try {
    await confirmPasswordReset(input.token, input.password);
    return { success: true };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        success: false,
        error:
          ERROR_MESSAGES[error.code ?? ''] ??
          'Não foi possível redefinir a senha. Tente novamente.',
      };
    }
    return { success: false, error: 'Não foi possível redefinir a senha. Tente novamente.' };
  }
}
