import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { SearchError } from '@flight-watch/contracts';

@Catch(SearchError)
export class SearchErrorFilter implements ExceptionFilter {
  catch(exception: SearchError, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    reply.status(exception.status).send({ code: exception.errorCode, message: exception.message });
  }
}
