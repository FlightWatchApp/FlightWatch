# AGENTS.md — `packages/database`

Regras desta pasta, além das do [`AGENTS.md` da raiz](../../AGENTS.md). Prisma,
migrações e repositórios (consultas usadas por mais de um app).

## Receita: mudar o banco

1. Editar `prisma/schema.prisma`.
2. Gerar a migração com nome descritivo:
   `pnpm --filter @flight-watch/database prisma:migrate --name <o_que_muda>`
   (cria `prisma/migrations/<data>_<nome>/migration.sql`). Ler o SQL gerado.
3. **Só aditiva**: tabela, coluna anulável ou com padrão, índice. Mudança
   incompatível = expandir/contrair em duas entregas, com spec.
4. Migração publicada (já na `main`) **nunca** é editada; erro se corrige com
   migração nova.
5. Índice em tabela grande: avaliar lock e tempo; dados existentes: backfill
   em lotes, reiniciável e observável (modelo: `prisma/backfill-low-price.ts`),
   rodado só com aprovação.
6. `pnpm --filter @flight-watch/database exec prisma generate` e recompilar os
   pacotes que usam o cliente (H13).

## Receita: repositório novo

1. `src/<assunto>-repository.ts` com funções que recebem o cliente ou a
   transação (`tx`) — quem chama decide a transação.
2. Exportar em `src/index.ts`.
3. Teste `src/<assunto>-repository.integration.test.ts` com Postgres real
   (Testcontainers; modelo: `access-repository.integration.test.ts`),
   incluindo o caso concorrente quando houver unicidade ou trava (H07, H14).

## Regras

- Unicidade e idempotência ficam no banco (`@unique`), não só no código.
- `PriceObservation` nunca recebe `update`; correção é linha nova.
- Sem `onDelete: Cascade` sem decisão do domínio; exclusão de conta segue a
  SPEC-027.
- Dinheiro em `Int`/`BigInt` na menor unidade + moeda; instante em UTC.
- Consulta dentro de laço (N+1) é proibida em fan-out: buscar em lote (H09).
