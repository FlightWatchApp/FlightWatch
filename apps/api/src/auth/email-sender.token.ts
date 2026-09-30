/**
 * `EmailSender` (packages/notifications) é uma interface, não uma classe —
 * NestJS precisa de um token de injeção separado pra prover uma implementação
 * por trás dela (mesmo padrão de qualquer porta injetada por interface).
 */
export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
