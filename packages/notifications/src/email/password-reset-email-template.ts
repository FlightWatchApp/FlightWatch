export interface PasswordResetEmailTemplateData {
  resetUrl: string;
  /** Validade do link, em minutos, para o texto do e-mail. */
  expiresInMinutes: number;
}

export interface RenderedPasswordResetEmail {
  subject: string;
  textBody: string;
}

/** SPEC-026: texto puro, como o de confirmação de e-mail (SPEC-010). */
export function renderPasswordResetEmail(
  data: PasswordResetEmailTemplateData,
): RenderedPasswordResetEmail {
  const lines = [
    'Recebemos um pedido para redefinir a senha da sua conta no Flight Watch.',
    '',
    `Definir uma nova senha: ${data.resetUrl}`,
    '',
    `O link vale por ${data.expiresInMinutes} minutos e só pode ser usado uma vez. Ao definir a nova senha, todas as sessões abertas da conta são encerradas.`,
    '',
    'Se você não pediu isso, pode ignorar esta mensagem: sua senha continua a mesma.',
  ];

  return {
    subject: 'Redefinir sua senha — Flight Watch',
    textBody: lines.join('\n'),
  };
}
