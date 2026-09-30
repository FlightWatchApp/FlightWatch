import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { z } from 'zod';

const watchIdSchema = z.string().uuid();

@Injectable()
export class WatchIdValidationPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    const result = watchIdSchema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({ code: 'INVALID_WATCH_ID', message: 'invalid watch id' });
    }
    return result.data;
  }
}
