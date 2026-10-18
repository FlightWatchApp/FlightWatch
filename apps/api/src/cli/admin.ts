import { AdminError } from '@flight-watch/contracts';
import { createPrismaClient } from '@flight-watch/database';
import { logEvent } from '@flight-watch/observability';
import { changeUserRole, issueInvite } from '../admin/admin-core.js';
import { parseAdminArgs } from './admin-args.js';

/**
 * SPEC-043: comando de administração no servidor (quem tem SSH). É o único jeito
 * de virar admin e o plano B para gerar uma chave se o site estiver fora.
 * Local: `pnpm --filter @flight-watch/api admin -- promote --email x@y`.
 * Produção: `deploy/bin/admin.sh promote --email x@y`.
 */
async function main(): Promise<number> {
  const parsed = parseAdminArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.message);
    return 2;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL não definida.');
    return 2;
  }

  const prisma = createPrismaClient(databaseUrl);
  try {
    const { command } = parsed;
    if (command.name === 'invite') {
      const ttlDays = command.days ?? Number(process.env.INVITE_TTL_DAYS ?? 30);
      const issued = await issueInvite(prisma, {
        email: command.email,
        ttlDays,
        actor: null,
        action: 'invite_created',
        now: new Date(),
      });
      logEvent({ event: 'admin_cli_invite_created', inviteId: issued.inviteId });
      // A chave só existe aqui: não vai para o log nem para o banco.
      console.log(`Chave para ${issued.email} (vale até ${issued.expiresAt.toISOString()}):`);
      console.log(issued.code);
      console.log(
        `Link: ${process.env.WEB_BASE_URL ?? ''}/register#convite=${issued.code.replaceAll('-', '')}&email=${encodeURIComponent(issued.email)}`,
      );
      return 0;
    }

    await changeUserRole(prisma, {
      email: command.email,
      role: command.name === 'promote' ? 'ADMIN' : 'USER',
    });
    logEvent({ event: 'admin_cli_role_changed', role: command.name });
    console.log(command.name === 'promote' ? 'Promovido a admin.' : 'Admin removido.');
    return 0;
  } catch (error) {
    if (error instanceof AdminError) {
      console.error(`Não foi possível: ${error.errorCode} — ${error.message}`);
      return 1;
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error('Falha inesperada:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
