# AGENTS.md — `apps/api`

Regras desta pasta, além das do [`AGENTS.md` da raiz](../../AGENTS.md).
NestJS 11 + Fastify; um módulo por contexto em `src/<contexto>/`
(controller, service, module, pipes, filtros e `*.e2e.spec.ts` lado a lado).

## Receita: rota nova

1. **Contrato** em `packages/contracts/src/<contexto>/` (ver o `AGENTS.md` de
   lá): schema Zod `.strict()` do pedido (`*RequestSchema` ou `*QuerySchema`)
   e da resposta, exportados no `index.ts`.
2. **Validação** num pipe que faz `safeParse` e, se falhar, lança
   `BadRequestException({ code: 'INVALID_INPUT' | 'INVALID_QUERY', message })`
   (modelo: `UpdateMeValidationPipe` em `me/me.controller.ts`). Nunca devolver
   o detalhe do Zod para o cliente.
3. **Controller** com os guards certos:
   - logada: `@UseGuards(SessionAuthGuard)` + `@CurrentUser() userId`;
   - admin: `AdminGuard` (responde 404 a quem não é admin) e toda ação grava
     auditoria na mesma transação (`admin/admin-core.ts`);
   - limite de pedidos: conta e ações sensíveis → `@AuthRateLimited()`;
     busca → `SearchThrottlerGuard`; página pública → throttler `pages`.
   - **guard que lança erro de domínio exige o filtro dele**: quem usa
     `SearchThrottlerGuard` põe `@UseFilters(SearchErrorFilter)`, senão o
     excesso vira 500 (H16).
4. **Service** com a regra; consulta que outro app também usa vai para um
   repositório em `packages/database`. Erro esperado = classe própria
   (`AdminError`, `CreateWatchError`…) com `{ code, message }` e um
   `@Catch` dela no controller. Recurso de outra pessoa responde 404.
5. **Módulo** registrado em `app.module.ts`.
6. **Teste** `*.e2e.spec.ts` com Postgres real (todo teste da API termina em
   `.spec.ts`: a suíte só roda esse padrão — um `.test.ts` aqui é ignorado) (copiar o `beforeAll` de
   `me/me.e2e.spec.ts`): caminho feliz, entrada inválida (400), sem login (401)
   e dono errado (404).
7. **Caça a erro 500** (`src/route-hunt.e2e.spec.ts`): a rota entra sozinha.
   Campo de contrato com nome novo precisa de um valor válido em `VALID` (ou
   entrar em `OPTIONAL_WITHOUT_VALUE`, se for opcional); o teste de sanidade
   da caça falha até isso ser feito.
8. **Docs**: `docs/API.md` e a spec.

## Regras

- Link de compra (`purchaseUrl`, `allFlightsUrl`) só por `resolvePartnerLink`
  (`affiliate/purchase-links.ts`): ele escolhe o parceiro (`PURCHASE_PARTNER`),
  passa pela allowlist e aplica o afiliado. Nunca ler o `deeplink` gravado
  direto para a resposta (SPEC-044, ADR-009).

- Respostas de erro sempre `{ code, message }`, com código estável; nunca
  stack, SQL, nome de tabela ou mensagem do Prisma.
- Log por `logEvent` (JSON) com ids opacos; nunca e-mail, senha, token,
  chave de convite ou corpo do pedido.
- Métrica nova: nome em `snake_case`, rótulos enumerados (nada de id), registrada
  em `observability/metrics.service.ts` e contada **depois** do commit (H10).
- Efeito externo (e-mail, fila) nasce de outbox ou depois do commit, nunca no
  meio da transação.
- Configuração só por `ApiConfig` (`config/`); nada de `process.env` solto.
