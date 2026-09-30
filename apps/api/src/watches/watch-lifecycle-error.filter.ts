import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { WatchLifecycleError } from '@flight-watch/contracts';

@Catch(WatchLifecycleError)
export class WatchLifecycleErrorFilter implements ExceptionFilter {
  catch(exception: WatchLifecycleError, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    reply.status(exception.status).send({ code: exception.errorCode, message: exception.message });
  }
}
