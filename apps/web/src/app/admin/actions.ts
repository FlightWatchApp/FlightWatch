'use server';

import { revalidatePath } from 'next/cache';
import type { CreateInviteResponse, UpdateAdminUserRequest } from '@flight-watch/contracts';
import { ApiError } from '@/lib/api/client';
import { createInvite, resendInvite, revokeInvite, updateAdminUser } from '@/lib/api/admin';

export type AdminActionResult<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : T)) | { ok: false; error: string };

const ERROR_MESSAGES: Record<string, string> = {
  INVITE_EMAIL_TAKEN: 'Esse e-mail já tem uma conta.',
  INVITE_NOT_REVOCABLE: 'Só dá para revogar uma chave que ainda está disponível.',
  INVALID_ADMIN_INPUT: 'Dados inválidos — confira os campos.',
  NOT_FOUND: 'Não encontrado. Atualize a página.',
  RATE_LIMITED: 'Muitas tentativas em pouco tempo. Espere alguns minutos.',
};

function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof ApiError) {
    return { ok: false, error: ERROR_MESSAGES[error.code ?? ''] ?? 'Não foi possível concluir.' };
  }
  return { ok: false, error: 'Não foi possível concluir.' };
}

/** A chave sai uma vez aqui: não é guardada em lugar nenhum do web. */
export async function createInviteAction(
  email: string,
  ttlDays: number | undefined,
): Promise<AdminActionResult<{ created: CreateInviteResponse }>> {
  try {
    const created = await createInvite(email, ttlDays);
    revalidatePath('/admin/convites');
    return { ok: true, created };
  } catch (error) {
    return failure(error);
  }
}

export async function resendInviteAction(
  id: string,
): Promise<AdminActionResult<{ created: CreateInviteResponse }>> {
  try {
    const created = await resendInvite(id);
    revalidatePath('/admin/convites');
    return { ok: true, created };
  } catch (error) {
    return failure(error);
  }
}

export async function revokeInviteAction(id: string): Promise<AdminActionResult> {
  try {
    await revokeInvite(id);
    revalidatePath('/admin/convites');
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function updateUserAction(
  id: string,
  patch: UpdateAdminUserRequest,
): Promise<AdminActionResult> {
  try {
    await updateAdminUser(id, patch);
    revalidatePath('/admin/pessoas');
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
