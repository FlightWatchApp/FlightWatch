import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { type ListOpportunitiesQuery, listOpportunitiesQuerySchema } from '@flight-watch/contracts';

@Injectable()
export class ListOpportunitiesValidationPipe implements PipeTransform<
  unknown,
  ListOpportunitiesQuery
> {
  transform(value: unknown): ListOpportunitiesQuery {
    const result = listOpportunitiesQuerySchema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'INVALID_OPPORTUNITIES_QUERY',
        message: 'invalid opportunities query',
        issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      });
    }
    return result.data;
  }
}
