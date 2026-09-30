import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { DeriveWatchError } from '@flight-watch/contracts';

@Catch(DeriveWatchError)
export class DeriveWatchErrorFilter implements ExceptionFilter {
  catch(exception: DeriveWatchError, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    reply.status(exception.status).send({ code: exception.errorCode, message: exception.message });
  }
}
