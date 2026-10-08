import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { type ListPromotionsQuery, listPromotionsQuerySchema } from '@flight-watch/contracts';

/** SPEC-032: mesmo formato de erro da busca e do calendário (INVALID_SEARCH_INPUT). */
@Injectable()
export class ListPromotionsValidationPipe implements PipeTransform<unknown, ListPromotionsQuery> {
  transform(value: unknown): ListPromotionsQuery {
    const result = listPromotionsQuerySchema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'INVALID_SEARCH_INPUT',
        message: 'invalid promotions query',
        issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      });
    }
    return result.data;
  }
}
