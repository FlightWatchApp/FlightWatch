import { Inject, Injectable } from '@nestjs/common';
import {
  type AuthenticatedUser,
  AuthError,
  type AuthSessionResponse,
  type LoginRequest,
  type RegisterRequest,
} from '@flight-watch/contracts';
import type { NotificationChannel, Prisma, PrismaClient, User } from '@flight-watch/database';
import { isUniqueConstraintViolation } from '@flight-watch/database';
import type { EmailSender } from '@flight-watch/notifications';
import { renderVerificationEmail } from '@flight-watch/notifications';
import { logEvent } from '@flight-watch/observability';
import { PrismaService } from '../prisma/prisma.service.js';
import { MetricsService } from '../observability/metrics.service.js';
import { EMAIL_SENDER } from './email-sender.token.js';
import { generateOpaqueToken, hashOpaqueToken } from './opaque-token.js';
import { hashPassword, verifyPassword } from './password-hash.js';

// Placeholders — produto ainda não definiu política final (SPEC-007 §9).
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// SPEC-010 §7: prazo do token de confirmação de e-mail.
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
// SPEC-010 §3: a base do link aponta pro apps/web (onde a página /verify-email
// existe), não pro apps/api — diferente do WEB_BASE_URL de
// apps/notification-worker/src/main.ts, cujo default (porta 3000, a do
// próprio apps/api) parece um bug pré-existente fora do escopo desta spec.
const WEB_BASE_URL = process.env.WEB_BASE_URL ?? 'http://localhost:3100';

// Mitigação de enumeração por tempo de resposta (SPEC-007 §6): verificado
// mesmo quando o email não existe, pra login com email inexistente não ser
// perceptivelmente mais rápido que login com senha errada. Calculado uma vez.
const dummyPasswordHashPromise = hashPassword('dummy-password-for-timing-mitigation');

type Db = PrismaClient | Prisma.TransactionClient;
type ChannelSummary = Pick<NotificationChannel, 'id' | 'verifiedAt'>;

function toAuthenticatedUser(user: User, channel: ChannelSummary | null): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    notificationChannelId: channel?.id ?? null,
    notificationChannelVerified: channel?.verifiedAt != null,
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
  ) {}

  /** SPEC-007 §13: `auth_register_total{result}`. */
  async register(request: RegisterRequest): Promise<AuthSessionResponse> {
    try {
      const response = await this.doRegister(request);
      this.metrics.authRegisterTotal.inc({ result: 'success' });
      return response;
    } catch (error) {
      const result = error instanceof AuthError ? error.errorCode.toLowerCase() : 'internal_error';
      this.metrics.authRegisterTotal.inc({ result });
      throw error;
    }
  }

  private async doRegister(request: RegisterRequest): Promise<AuthSessionResponse> {
    const passwordHash = await hashPassword(request.password);
    const verificationToken = generateOpaqueToken();
    const verificationTokenExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

    let result: AuthSessionResponse;
    try {
      // Sessão criada NA MESMA transação que o User/NotificationChannel — se o
      // processo cair entre o commit e emitir a sessão, o usuário existiria
      // sem nenhuma sessão válida, e register() teria retornado sucesso sem
      // um token utilizável. Tudo ou nada, como o resto do fluxo de criação.
      result = await this.prisma.client.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email: request.email,
            status: 'ACTIVE',
            timezone: request.timezone,
            passwordHash,
          },
        });
        const channel = await tx.notificationChannel.create({
          data: {
            userId: createdUser.id,
            type: 'EMAIL',
            destination: createdUser.email,
            status: 'ACTIVE',
            verifiedAt: null,
            verificationTokenHash: hashOpaqueToken(verificationToken),
            verificationTokenExpiresAt,
          },
        });
        const session = await this.issueSession(tx, createdUser, channel);
        return session;
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'email')) {
        throw new AuthError('EMAIL_ALREADY_REGISTERED', 'email already registered');
      }
      throw error;
    }

    // SPEC-010 §3: fora da transação (I/O externo) e best-effort — uma falha
    // aqui não derruba um registro já commitado; o usuário tem resendVerification
    // como caminho de recuperação.
    await this.sendVerificationEmail(request.email, verificationToken).catch((error: unknown) => {
      logEvent({ event: 'verification_email_send_failed', error });
    });
    return result;
  }

  private async sendVerificationEmail(email: string, token: string): Promise<void> {
    const verificationUrl = `${WEB_BASE_URL}/verify-email?token=${encodeURIComponent(token)}`;
    const rendered = renderVerificationEmail({ verificationUrl });
    await this.emailSender.send({
      to: email,
      subject: rendered.subject,
      textBody: rendered.textBody,
      idempotencyKey: `email-verification-${hashOpaqueToken(token)}`,
    });
  }

  /** SPEC-010 §14: `auth_verify_email_total{result}`. */
  async verifyEmail(token: string, correlationId: string): Promise<void> {
    try {
      const result = await this.doVerifyEmail(token);
      this.metrics.authVerifyEmailTotal.inc({ result });
      logEvent({ event: 'auth_verify_email', result, correlationId });
    } catch (error) {
      const result = error instanceof AuthError ? error.errorCode.toLowerCase() : 'internal_error';
      this.metrics.authVerifyEmailTotal.inc({ result });
      logEvent({ event: 'auth_verify_email', result, correlationId });
      throw error;
    }
  }

  private async doVerifyEmail(token: string): Promise<'success' | 'already_verified'> {
    const channel = await this.prisma.client.notificationChannel.findUnique({
      where: { verificationTokenHash: hashOpaqueToken(token) },
    });
    if (!channel) {
      throw new AuthError('INVALID_VERIFICATION_TOKEN', 'invalid verification token');
    }
    // SPEC-010 §7: já verificado é idempotente — cobre clique duplo ou
    // pré-carregamento do link por scanner de e-mail. O hash NÃO é limpo ao
    // verificar (ver comentário no schema), então esse ramo é alcançável.
    if (channel.verifiedAt) {
      return 'already_verified';
    }
    if (!channel.verificationTokenExpiresAt || channel.verificationTokenExpiresAt <= new Date()) {
      throw new AuthError('VERIFICATION_TOKEN_EXPIRED', 'verification token expired');
    }
    await this.prisma.client.notificationChannel.update({
      where: { id: channel.id },
      data: { verifiedAt: new Date() },
    });
    return 'success';
  }

  /** SPEC-010 §14: `auth_resend_verification_total{result}`. */
  async resendVerification(userId: string, correlationId: string): Promise<void> {
    const result = await this.doResendVerification(userId);
    this.metrics.authResendVerificationTotal.inc({ result });
    logEvent({ event: 'auth_resend_verification', result, correlationId });
  }

  private async doResendVerification(userId: string): Promise<'sent' | 'already_verified'> {
    const channel = await this.prisma.client.notificationChannel.findFirstOrThrow({
      where: { userId, type: 'EMAIL' },
      orderBy: { createdAt: 'asc' },
    });
    if (channel.verifiedAt) {
      return 'already_verified';
    }

    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
    await this.prisma.client.notificationChannel.update({
      where: { id: channel.id },
      data: {
        verificationTokenHash: hashOpaqueToken(token),
        verificationTokenExpiresAt: expiresAt,
      },
    });

    const user = await this.prisma.client.user.findUniqueOrThrow({ where: { id: userId } });
    await this.sendVerificationEmail(user.email, token).catch((error: unknown) => {
      logEvent({ event: 'verification_email_send_failed', error });
    });
    return 'sent';
  }

  /** SPEC-007 §13: `auth_login_total{result}` — success/invalid_credentials/locked/account_not_active. */
  async login(request: LoginRequest): Promise<AuthSessionResponse> {
    try {
      const response = await this.doLogin(request);
      this.metrics.authLoginTotal.inc({ result: 'success' });
      return response;
    } catch (error) {
      const result = error instanceof AuthError ? error.errorCode.toLowerCase() : 'internal_error';
      this.metrics.authLoginTotal.inc({ result });
      throw error;
    }
  }

  private async doLogin(request: LoginRequest): Promise<AuthSessionResponse> {
    const user = await this.prisma.client.user.findUnique({ where: { email: request.email } });

    if (!user) {
      await verifyPassword(await dummyPasswordHashPromise, request.password);
      throw new AuthError('INVALID_CREDENTIALS', 'invalid email or password');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AuthError('ACCOUNT_LOCKED', 'account temporarily locked');
    }

    const passwordValid = await verifyPassword(user.passwordHash, request.password);
    if (!passwordValid) {
      await this.registerFailedLoginAttempt(user);
      throw new AuthError('INVALID_CREDENTIALS', 'invalid email or password');
    }

    // Credenciais corretas não bastam — status BLOCKED/DELETED/PENDING_VERIFICATION
    // não deve poder logar, mesmo sabendo a senha certa (autorização por estado
    // do recurso, não só por autenticação — AGENTS.md §8).
    if (user.status !== 'ACTIVE') {
      throw new AuthError('ACCOUNT_NOT_ACTIVE', 'account is not active');
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.client.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    const channel = await this.prisma.client.notificationChannel.findFirst({
      where: { userId: user.id, type: 'EMAIL' },
      orderBy: { createdAt: 'asc' },
    });

    return this.issueSession(this.prisma.client, user, channel);
  }

  async logout(rawToken: string): Promise<void> {
    await this.prisma.client.session.deleteMany({
      where: { tokenHash: hashOpaqueToken(rawToken) },
    });
  }

  async getCurrentUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.client.user.findUniqueOrThrow({ where: { id: userId } });
    const channel = await this.prisma.client.notificationChannel.findFirst({
      where: { userId: user.id, type: 'EMAIL' },
      orderBy: { createdAt: 'asc' },
    });
    return toAuthenticatedUser(user, channel);
  }

  /**
   * @returns o `userId` da sessão válida, ou `null` se ausente/expirada/o
   * usuário não estiver mais ACTIVE (uma sessão emitida antes de a conta ser
   * bloqueada/excluída não deve continuar autorizando nada — reautorização
   * por estado atual do recurso a cada request, não só pela existência do
   * token, AGENTS.md §8).
   */
  async validateSession(rawToken: string): Promise<string | null> {
    const session = await this.prisma.client.session.findUnique({
      where: { tokenHash: hashOpaqueToken(rawToken) },
      include: { user: { select: { status: true } } },
    });
    if (!session || session.expiresAt <= new Date() || session.user.status !== 'ACTIVE') {
      return null;
    }
    return session.userId;
  }

  /**
   * Incremento atômico no banco (`SET failed_login_attempts = failed_login_attempts + 1`)
   * — a versão anterior lia `user.failedLoginAttempts`, somava em memória e
   * escrevia de volta; duas tentativas erradas concorrentes liam o mesmo valor
   * e uma das duas escritas se perdia (lost update), deixando o contador
   * atrasado e o bloqueio nunca disparando sob concorrência real.
   */
  private async registerFailedLoginAttempt(user: User): Promise<void> {
    const updated = await this.prisma.client.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: { increment: 1 } },
    });
    if (updated.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      await this.prisma.client.user.update({
        where: { id: user.id },
        data: { lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS) },
      });
    }
  }

  private async issueSession(
    db: Db,
    user: User,
    channel: ChannelSummary | null,
  ): Promise<AuthSessionResponse> {
    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.session.create({
      data: { userId: user.id, tokenHash: hashOpaqueToken(token), expiresAt },
    });
    return {
      token,
      expiresAt: expiresAt.toISOString(),
      user: toAuthenticatedUser(user, channel),
    };
  }
}
