import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import {
  type DeriveWatchFromOfferRequest,
  deriveWatchFromOfferRequestSchema,
} from '@flight-watch/contracts';

@Injectable()
export class DeriveWatchValidationPipe implements PipeTransform<
  unknown,
  DeriveWatchFromOfferRequest
> {
  transform(value: unknown): DeriveWatchFromOfferRequest {
    const result = deriveWatchFromOfferRequestSchema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'INVALID_SEARCH_INPUT',
        message: 'invalid derive-watch input',
        issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      });
    }
    return result.data;
  }
}
