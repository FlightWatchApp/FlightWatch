import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { type SearchPlacesQuery, searchPlacesQuerySchema } from '@flight-watch/contracts';

/** SPEC-029. */
@Injectable()
export class SearchPlacesValidationPipe implements PipeTransform<unknown, SearchPlacesQuery> {
  transform(value: unknown): SearchPlacesQuery {
    const result = searchPlacesQuerySchema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'INVALID_PLACES_QUERY',
        message: 'invalid places query',
        issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      });
    }
    return result.data;
  }
}
