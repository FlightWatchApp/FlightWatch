# AGENTS.md — `packages/contracts`

Regras desta pasta, além das do [`AGENTS.md` da raiz](../../AGENTS.md). Aqui
mora o contrato entre web, API, filas e workers: schemas Zod, tipos e códigos
de erro. Nada de NestJS, Prisma ou React.

## Receita: contrato novo

1. Arquivo em `src/<contexto>/` com o schema do pedido (`*RequestSchema`,
   `*QuerySchema`) e o da resposta (`*ResponseSchema`), mais
   `export type X = z.infer<typeof xSchema>`.
2. Pedido sempre `.strict()` (campo desconhecido = 400). Use os campos
   compartilhados de `src/shared/` (`iataCodeSchema`, `isoDateSchema`…)
   em vez de redefinir.
3. Query string chega como texto: números com `z.coerce.number().int()` e
   limites (`min`/`max`); texto com `.max()`.
4. Dinheiro em inteiro na menor unidade + `currency`; nunca `number` decimal.
5. Códigos de erro num objeto `*_ERROR_CODES` com `status` e `code` (modelo:
   `src/admin/errors.ts`) e uma classe de erro que os carrega.
6. Exportar no `src/index.ts` e escrever o `*.test.ts` do schema (aceita,
   recusa, normaliza).
7. Campo com **nome novo**: valor válido em `VALID` de
   `apps/api/src/route-hunt.e2e.spec.ts` (ou em `OPTIONAL_WITHOUT_VALUE`).

## Regras

- Contrato publicado não muda de forma incompatível: campo novo é opcional;
  remover ou mudar o tipo exige spec com plano de migração.
- Valor de enum gravado no banco ou enviado ao web nunca muda de texto; valor
  novo pode ser acrescentado, e quem lê precisa tolerar o desconhecido.
- Evento e job: envelope versionado (`schemaVersion`), payload mínimo (ids),
  sem e-mail nem segredo (`docs/ENGINEERING.md` §9).
