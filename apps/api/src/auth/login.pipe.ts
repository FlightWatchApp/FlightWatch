import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { type LoginRequest, loginRequestSchema } from '@flight-watch/contracts';

@Injectable()
export class LoginValidationPipe implements PipeTransform<unknown, LoginRequest> {
  transform(value: unknown): LoginRequest {
    const result = loginRequestSchema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'INVALID_AUTH_INPUT',
        message: 'invalid login input',
        issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      });
    }
    return result.data;
  }
}
