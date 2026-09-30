import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { CreateWatchError } from '@flight-watch/contracts';

@Catch(CreateWatchError)
export class CreateWatchErrorFilter implements ExceptionFilter {
  catch(exception: CreateWatchError, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    reply.status(exception.status).send({ code: exception.errorCode, message: exception.message });
  }
}
