import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { type CreateWatchRequest, createWatchRequestSchema } from '@flight-watch/contracts';

@Injectable()
export class CreateWatchValidationPipe implements PipeTransform<unknown, CreateWatchRequest> {
  transform(value: unknown): CreateWatchRequest {
    const result = createWatchRequestSchema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'INVALID_WATCH_INPUT',
        message: 'invalid watch input',
        issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      });
    }
    return result.data;
  }
}
