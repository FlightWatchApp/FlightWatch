import { Module } from '@nestjs/common';
import { InMemoryEmailSender } from '@flight-watch/notifications';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { EMAIL_SENDER } from './email-sender.token.js';
import { SessionAuthGuard } from './session-auth.guard.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionAuthGuard,
    // SPEC-010 §3: canal real (SMTP/SES/Resend/etc.) entra aqui atrás da mesma
    // porta EmailSender quando existir — mesmo padrão de
    // apps/notification-worker/src/main.ts, sem fornecedor decidido ainda.
    { provide: EMAIL_SENDER, useValue: new InMemoryEmailSender() },
  ],
  exports: [AuthService, SessionAuthGuard],
})
export class AuthModule {}
