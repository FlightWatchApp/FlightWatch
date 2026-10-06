import { Body, Controller, Get, HttpCode, Post, UseFilters, UseGuards } from '@nestjs/common';
import type {
  AuthenticatedUser,
  DeleteAccountRequest,
  LoginRequest,
  LoginResponse,
  PasswordResetConfirm,
  PasswordResetRequest,
  RegisterRequest,
  RegisterResponse,
  VerifyEmailRequest,
  VerifyEmailResponse,
} from '@flight-watch/contracts';
import { AuthRateLimited } from './auth-throttler.guard.js';
import { AuthService } from './auth.service.js';
import { AuthErrorFilter } from './auth-error.filter.js';
import { CurrentSessionToken } from './current-session-token.decorator.js';
import { CurrentUser } from './current-user.decorator.js';
import { DeleteAccountValidationPipe } from './delete-account.pipe.js';
import { CurrentCorrelationId } from '../observability/correlation.js';
import { LoginValidationPipe } from './login.pipe.js';
import {
  PasswordResetConfirmValidationPipe,
  PasswordResetRequestValidationPipe,
} from './password-reset.pipe.js';
import { RegisterValidationPipe } from './register.pipe.js';
import { SessionAuthGuard } from './session-auth.guard.js';
import { VerifyEmailValidationPipe } from './verify-email.pipe.js';

@Controller('v1/auth')
@UseFilters(AuthErrorFilter)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(201)
  @AuthRateLimited()
  async register(@Body(RegisterValidationPipe) body: RegisterRequest): Promise<RegisterResponse> {
    return this.authService.register(body);
  }

  @Post('login')
  @HttpCode(200)
  @AuthRateLimited()
  async login(@Body(LoginValidationPipe) body: LoginRequest): Promise<LoginResponse> {
    return this.authService.login(body);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(SessionAuthGuard)
  async logout(@CurrentSessionToken() token: string): Promise<void> {
    await this.authService.logout(token);
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  async me(@CurrentUser() userId: string): Promise<AuthenticatedUser> {
    return this.authService.getCurrentUser(userId);
  }

  // SPEC-010: sem guard de propósito — o token é a própria credencial de
  // posse (mesmo padrão de link de confirmação); quem clica pode não ter
  // sessão válida no dispositivo/navegador em que abriu o e-mail.
  @Post('verify-email')
  @HttpCode(200)
  @AuthRateLimited()
  async verifyEmail(
    @Body(VerifyEmailValidationPipe) body: VerifyEmailRequest,
    @CurrentCorrelationId() correlationId: string,
  ): Promise<VerifyEmailResponse> {
    await this.authService.verifyEmail(body.token, correlationId);
    return { status: 'verified' };
  }

  // SPEC-010 §4: autenticado — só reenvia pro canal do próprio usuário logado,
  // nunca pra um alvo arbitrário.
  @Post('resend-verification')
  @HttpCode(204)
  @UseGuards(SessionAuthGuard)
  @AuthRateLimited()
  async resendVerification(
    @CurrentUser() userId: string,
    @CurrentCorrelationId() correlationId: string,
  ): Promise<void> {
    await this.authService.resendVerification(userId, correlationId);
  }

  // SPEC-026: sem guard — quem esqueceu a senha não tem sessão. Sempre 202.
  @Post('password-reset/request')
  @HttpCode(202)
  @AuthRateLimited()
  async requestPasswordReset(
    @Body(PasswordResetRequestValidationPipe) body: PasswordResetRequest,
    @CurrentCorrelationId() correlationId: string,
  ): Promise<void> {
    await this.authService.requestPasswordReset(body.email, correlationId);
  }

  // SPEC-026: o token do e-mail é a credencial; encerra todas as sessões.
  @Post('password-reset/confirm')
  @HttpCode(204)
  @AuthRateLimited()
  async confirmPasswordReset(
    @Body(PasswordResetConfirmValidationPipe) body: PasswordResetConfirm,
    @CurrentCorrelationId() correlationId: string,
  ): Promise<void> {
    await this.authService.confirmPasswordReset(body.token, body.password, correlationId);
  }

  // SPEC-027: exige sessão e a senha atual; anonimiza a conta.
  @Post('delete-account')
  @HttpCode(204)
  @UseGuards(SessionAuthGuard)
  @AuthRateLimited()
  async deleteAccount(
    @CurrentUser() userId: string,
    @Body(DeleteAccountValidationPipe) body: DeleteAccountRequest,
    @CurrentCorrelationId() correlationId: string,
  ): Promise<void> {
    await this.authService.deleteAccount(userId, body.password, correlationId);
  }
}
