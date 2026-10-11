import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { z, ZodTypeAny } from 'zod';
import {
  type GetRouteParams,
  type GetRouteQuery,
  getRouteParamsSchema,
  getRouteQuerySchema,
} from '@flight-watch/contracts';

/** SPEC-033: mesmo formato de erro da busca, do calendário e das promoções. */
function validate<S extends ZodTypeAny>(schema: S, value: unknown, message: string): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      code: 'INVALID_SEARCH_INPUT',
      message,
      issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    });
  }
  return result.data;
}

@Injectable()
export class GetRouteParamsPipe implements PipeTransform<unknown, GetRouteParams> {
  transform(value: unknown): GetRouteParams {
    return validate(getRouteParamsSchema, value, 'invalid route');
  }
}

@Injectable()
export class GetRouteQueryPipe implements PipeTransform<unknown, GetRouteQuery> {
  transform(value: unknown): GetRouteQuery {
    return validate(getRouteQuerySchema, value, 'invalid route query');
  }
}
