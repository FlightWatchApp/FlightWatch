import { BadRequestException } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Erro 400 INVALID_AUTH_INPUT no formato das rotas de auth; issues sem valores. */
export function parseAuthInput<T>(schema: ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      code: 'INVALID_AUTH_INPUT',
      message,
      issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    });
  }
  return result.data;
}
