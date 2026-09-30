export interface VerificationEmailTemplateData {
  verificationUrl: string;
}

export interface RenderedVerificationEmail {
  subject: string;
  textBody: string;
}

export function renderVerificationEmail(
  data: VerificationEmailTemplateData,
): RenderedVerificationEmail {
  const lines = [
    'Confirme seu e-mail para começar a receber alertas de preço do Flight Watch.',
    '',
    `Confirmar e-mail: ${data.verificationUrl}`,
    '',
    'Se você não criou esta conta, pode ignorar esta mensagem.',
  ];

  return {
    subject: 'Confirme seu e-mail — Flight Watch',
    textBody: lines.join('\n'),
  };
}
