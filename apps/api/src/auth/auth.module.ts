import { Module } from '@nestjs/common';
import { createEmailSender } from '@flight-watch/notifications';
import { API_CONFIG, type ApiConfig } from '../config/config.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { EMAIL_SENDER } from './email-sender.token.js';
import { SessionAuthGuard } from './session-auth.guard.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionAuthGuard,
    // SPEC-010 §3: canal real (SMTP/SES/Resend/etc.) entra atrás da mesma porta
    // EmailSender, escolhido por EMAIL_PROVIDER (SPEC-024) — mesmo padrão de
    // apps/notification-worker/src/main.ts.
    {
      provide: EMAIL_SENDER,
      inject: [API_CONFIG],
      useFactory: (config: ApiConfig) => createEmailSender(config.EMAIL_PROVIDER),
    },
  ],
  exports: [AuthService, SessionAuthGuard],
})
export class AuthModule {}
