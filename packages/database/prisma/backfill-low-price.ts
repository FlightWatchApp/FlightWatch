/**
 * SPEC-039: passa os Watches ativos e pausados para o alerta de preço baixo.
 *
 *   pnpm --filter @flight-watch/database backfill:low-price -- --dry-run
 *   pnpm --filter @flight-watch/database backfill:low-price
 *   pnpm --filter @flight-watch/database backfill:low-price -- --revert
 *
 * Usa DATABASE_URL e ALERT_LOW_PRICE_DROP_PERCENT (padrão 15). Em produção,
 * só com aprovação do owner (CLAUDE.md §21). Idempotente; nada é apagado.
 */
import { lowPriceDropPercentIsValid } from '@flight-watch/domain';
import { createPrismaClient } from '../src/client.js';
import { backfillLowPriceRules, revertLowPriceRules } from '../src/low-price-backfill.js';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const revert = process.argv.includes('--revert');
  const dropPercent = Number(process.env.ALERT_LOW_PRICE_DROP_PERCENT ?? '15');
  if (!lowPriceDropPercentIsValid(dropPercent)) {
    throw new Error('ALERT_LOW_PRICE_DROP_PERCENT precisa ser inteiro de 5 a 50');
  }

  const prisma = createPrismaClient();
  try {
    const result = revert
      ? await revertLowPriceRules(prisma, { dryRun })
      : await backfillLowPriceRules(prisma, { dropPercent, dryRun });
    console.log(
      JSON.stringify({ event: 'low_price_backfill', revert, dryRun, dropPercent, ...result }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: 'low_price_backfill_failed',
      errorName: error instanceof Error ? error.name : 'unknown',
    }),
  );
  process.exitCode = 1;
});
