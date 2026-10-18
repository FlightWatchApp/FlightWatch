export interface InviteEmailTemplateData {
  /** Link do cadastro com a chave e o e-mail no fragmento (`#`), nunca na query. */
  registerUrl: string;
  /** Chave já formatada em grupos de 5. */
  code: string;
  /** Validade, em dias, para o texto do e-mail. */
  validityDays: number;
}

export interface RenderedInviteEmail {
  subject: string;
  textBody: string;
}

/** SPEC-043: texto puro, transacional, sem propaganda. */
export function renderInviteEmail(data: InviteEmailTemplateData): RenderedInviteEmail {
  const lines = [
    'Seu acesso ao Flight Watch foi liberado. Use a chave abaixo para criar a sua conta.',
    '',
    `Criar a conta: ${data.registerUrl}`,
    '',
    `Sua chave de acesso: ${data.code}`,
    '',
    `A chave vale por ${data.validityDays} dias, só pode ser usada uma vez e só funciona com este e-mail.`,
    '',
    'Se você não comprou o acesso, ignore este e-mail.',
  ];

  return {
    subject: 'Sua chave de acesso ao Flight Watch',
    textBody: lines.join('\n'),
  };
}
