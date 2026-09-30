import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * ADR-007 (revisado): só `/health` fica na porta pública (0.0.0.0, mesmo
 * listener do tráfego real) — é só ok/unhealthy, sem detalhe interno, e
 * balanceador de carga/orquestrador precisa alcançá-lo. `/metrics` (internals
 * operacionais: contadores por resultado) saiu daqui — ver main.ts, agora
 * serve numa porta dedicada isolada em 127.0.0.1 por padrão, mesmo padrão dos
 * workers (packages/observability's startMetricsServer). Achado de review:
 * expor `/metrics` na mesma porta pública do tráfego real era inconsistente
 * com essa postura já adotada nos outros 4 processos.
 */

// Achado de review: SELECT 1 sem timeout explícito podia travar o health
// check indefinidamente sob Postgres degradado — justamente o cenário em que
// um sinal rápido de "não saudável" mais importa.
const HEALTH_CHECK_TIMEOUT_MS = 2000;
const HEALTH_CHECK_MAX_WAIT_MS = 500;

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  async health(): Promise<{ status: 'ok' }> {
    try {
      await this.prisma.client.$transaction(
        async (tx) => {
          // O timeout é aplicado pelo próprio PostgreSQL à sessão/transação;
          // não é apenas um Promise.race que deixaria a query executando no
          // pool depois de responder 503.
          await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${HEALTH_CHECK_TIMEOUT_MS}`);
          await tx.$queryRaw`SELECT 1`;
        },
        { maxWait: HEALTH_CHECK_MAX_WAIT_MS, timeout: HEALTH_CHECK_TIMEOUT_MS },
      );
      return { status: 'ok' };
    } catch {
      throw new HttpException({ status: 'unhealthy' }, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
}
