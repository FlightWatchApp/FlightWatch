import { connection } from 'next/server';
import { RegisterForm } from './register-form';

/**
 * SPEC-041: a chave do captcha é lida ao responder (não na compilação), então
 * trocar `TURNSTILE_SITE_KEY` não exige reconstruir a imagem.
 */
export default async function RegisterPage() {
  await connection();
  return <RegisterForm siteKey={process.env.TURNSTILE_SITE_KEY || null} />;
}
