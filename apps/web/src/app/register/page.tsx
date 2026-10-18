import { connection } from 'next/server';
import { getRegistrationInfo } from '@/lib/api/auth';
import { RegisterForm } from './register-form';

/**
 * SPEC-041: a chave do captcha é lida ao responder (não na compilação), então
 * trocar `TURNSTILE_SITE_KEY` não exige reconstruir a imagem.
 */
export default async function RegisterPage() {
  await connection();
  // SPEC-043: se a API não responder, mostra o campo (a API recusa sem chave se for exigida).
  const { inviteRequired } = await getRegistrationInfo().catch(() => ({ inviteRequired: true }));
  return (
    <RegisterForm
      siteKey={process.env.TURNSTILE_SITE_KEY || null}
      inviteRequired={inviteRequired}
    />
  );
}
