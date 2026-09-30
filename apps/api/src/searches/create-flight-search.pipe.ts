import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import {
  type CreateFlightSearchRequest,
  createFlightSearchRequestSchema,
} from '@flight-watch/contracts';

@Injectable()
export class CreateFlightSearchValidationPipe implements PipeTransform<
  unknown,
  CreateFlightSearchRequest
> {
  transform(value: unknown): CreateFlightSearchRequest {
    const result = createFlightSearchRequestSchema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'INVALID_SEARCH_INPUT',
        message: 'invalid search input',
        issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      });
    }
    return result.data;
  }
}
