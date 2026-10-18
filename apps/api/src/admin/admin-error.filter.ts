import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { AdminError } from '@flight-watch/contracts';

@Catch(AdminError)
export class AdminErrorFilter implements ExceptionFilter {
  catch(exception: AdminError, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    reply.status(exception.status).send({ code: exception.errorCode, message: exception.message });
  }
}
