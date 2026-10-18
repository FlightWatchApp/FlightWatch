import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/session-auth.guard.js';
import { AuthService } from '../auth/auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const BEARER_PREFIX = 'Bearer ';

/**
 * SPEC-043: tudo que não é admin autenticado — sem sessão, sessão inválida,
 * pessoa comum — recebe o mesmo 404, para não revelar que as rotas existem.
 * O papel é lido do banco a cada requisição: rebaixar tira o acesso na hora.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers['authorization'];
    const raw = Array.isArray(header) ? header[0] : header;
    const token = raw?.startsWith(BEARER_PREFIX) ? raw.slice(BEARER_PREFIX.length) : undefined;

    const userId = token ? await this.authService.validateSession(token) : null;
    const user = userId
      ? await this.prisma.client.user.findUnique({
          where: { id: userId },
          select: { role: true },
        })
      : null;
    if (!userId || user?.role !== 'ADMIN') {
      throw new NotFoundException();
    }

    request.userId = userId;
    return true;
  }
}
