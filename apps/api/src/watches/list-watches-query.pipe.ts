import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { type ListWatchesQuery, listWatchesQuerySchema } from '@flight-watch/contracts';

@Injectable()
export class ListWatchesQueryPipe implements PipeTransform<unknown, ListWatchesQuery> {
  transform(value: unknown): ListWatchesQuery {
    const result = listWatchesQuerySchema.safeParse(value ?? {});
    if (!result.success) {
      throw new BadRequestException({ code: 'INVALID_QUERY', message: 'invalid query' });
    }
    return result.data;
  }
}
