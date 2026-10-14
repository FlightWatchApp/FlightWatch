import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { type WatchPreviewQuery, watchPreviewQuerySchema } from '@flight-watch/contracts';

/** SPEC-039: prévia da criação de Watch. */
@Injectable()
export class WatchPreviewQueryPipe implements PipeTransform<unknown, WatchPreviewQuery> {
  transform(value: unknown): WatchPreviewQuery {
    const result = watchPreviewQuerySchema.safeParse(value ?? {});
    if (!result.success) {
      throw new BadRequestException({ code: 'INVALID_QUERY', message: 'invalid query' });
    }
    return result.data;
  }
}
