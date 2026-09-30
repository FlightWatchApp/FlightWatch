import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { AuthenticatedRequest } from './session-auth.guard.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.userId;
  },
);
