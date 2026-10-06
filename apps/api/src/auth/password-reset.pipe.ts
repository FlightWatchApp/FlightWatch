import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import {
  type PasswordResetConfirm,
  type PasswordResetRequest,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from '@flight-watch/contracts';

function parseOrReject<T>(schema: ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    // Os issues trazem só caminho e regra, nunca a senha recebida.
    throw new BadRequestException({
      code: 'INVALID_AUTH_INPUT',
      message,
      issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    });
  }
  return result.data;
}

/** SPEC-026. */
@Injectable()
export class PasswordResetRequestValidationPipe implements PipeTransform<
  unknown,
  PasswordResetRequest
> {
  transform(value: unknown): PasswordResetRequest {
    return parseOrReject(passwordResetRequestSchema, value, 'invalid password reset input');
  }
}

/** SPEC-026. */
@Injectable()
export class PasswordResetConfirmValidationPipe implements PipeTransform<
  unknown,
  PasswordResetConfirm
> {
  transform(value: unknown): PasswordResetConfirm {
    return parseOrReject(passwordResetConfirmSchema, value, 'invalid password reset input');
  }
}
