import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { type PriceCalendarQuery, priceCalendarQuerySchema } from '@flight-watch/contracts';

/** SPEC-031: mesmo formato de erro da busca (INVALID_SEARCH_INPUT). */
@Injectable()
export class PriceCalendarValidationPipe implements PipeTransform<unknown, PriceCalendarQuery> {
  transform(value: unknown): PriceCalendarQuery {
    const result = priceCalendarQuerySchema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'INVALID_SEARCH_INPUT',
        message: 'invalid price calendar query',
        issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      });
    }
    return result.data;
  }
}
