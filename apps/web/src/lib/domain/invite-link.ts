export interface InviteFragment {
  code: string;
  email: string | null;
}

/**
 * SPEC-043: o link do e-mail leva a chave no fragmento (`#convite=…&email=…`),
 * que o navegador não envia ao servidor. Só o navegador chama isto. A chave só
 * tem letras, números e hífen: qualquer outra coisa (escape quebrado) é ignorada.
 */
export function parseInviteFragment(hash: string): InviteFragment | null {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const code = params.get('convite');
  if (!code || !/^[A-Za-z0-9\s-]+$/.test(code)) return null;
  return { code, email: params.get('email') };
}
