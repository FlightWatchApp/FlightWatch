import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { z } from 'zod';

const flightOfferIdSchema = z.string().uuid();

@Injectable()
export class FlightOfferIdValidationPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    const result = flightOfferIdSchema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'INVALID_OFFER_ID',
        message: 'invalid flight offer id',
      });
    }
    return result.data;
  }
}
