import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AuthService } from './auth.service.js';

export interface AuthenticatedRequest extends FastifyRequest {
  userId: string;
  sessionToken: string;
}

const BEARER_PREFIX = 'Bearer ';

function extractBearerToken(request: AuthenticatedRequest): string | undefined {
  const header = request.headers['authorization'];
  const raw = Array.isArray(header) ? header[0] : header;
  return raw?.startsWith(BEARER_PREFIX) ? raw.slice(BEARER_PREFIX.length) : undefined;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'missing or invalid Authorization header',
      });
    }

    const userId = await this.authService.validateSession(token);
    if (!userId) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'session is invalid or expired',
      });
    }

    request.userId = userId;
    request.sessionToken = token;
    return true;
  }
}
