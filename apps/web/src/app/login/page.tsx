import { connection } from 'next/server';
import { LoginForm } from './login-form';

/**
 * SPEC-041: a chave do captcha é lida ao responder (não na compilação), então
 * trocar `TURNSTILE_SITE_KEY` não exige reconstruir a imagem.
 */
export default async function LoginPage() {
  await connection();
  return <LoginForm siteKey={process.env.TURNSTILE_SITE_KEY || null} />;
}
