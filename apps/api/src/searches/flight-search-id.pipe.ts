import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { z } from 'zod';

const flightSearchIdSchema = z.string().uuid();

@Injectable()
export class FlightSearchIdValidationPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    const result = flightSearchIdSchema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'INVALID_SEARCH_ID',
        message: 'invalid flight search id',
      });
    }
    return result.data;
  }
}
