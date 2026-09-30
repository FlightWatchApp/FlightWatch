import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { type VerifyEmailRequest, verifyEmailRequestSchema } from '@flight-watch/contracts';

@Injectable()
export class VerifyEmailValidationPipe implements PipeTransform<unknown, VerifyEmailRequest> {
  transform(value: unknown): VerifyEmailRequest {
    const result = verifyEmailRequestSchema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'INVALID_AUTH_INPUT',
        message: 'invalid verification input',
        issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      });
    }
    return result.data;
  }
}
