import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { type RegisterRequest, registerRequestSchema } from '@flight-watch/contracts';

@Injectable()
export class RegisterValidationPipe implements PipeTransform<unknown, RegisterRequest> {
  transform(value: unknown): RegisterRequest {
    const result = registerRequestSchema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'INVALID_AUTH_INPUT',
        message: 'invalid registration input',
        issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      });
    }
    return result.data;
  }
}
