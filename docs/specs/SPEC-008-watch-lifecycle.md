# SPEC-008 — Ciclo de vida do monitoramento (pausar/reativar/encerrar)

Status: draft para aprovação
Versão: 0.1
Owner: Monitoring
Dependências: SPEC-001, SPEC-007

## 1. Objetivo

Permitir que o usuário autenticado pause, reative ou encerre um Watch que já possui, completando as transições de `DOMAIN.md` §3.2 que hoje não têm endpoint nenhum (`GET`/`POST` são os únicos verbos de `watches.controller.ts`). Fecha o objetivo 2 do MVP (`PRODUCT.md` §5) e a jornada principal, passo 10 (`PRODUCT.md` §8): "o usuário acessa o histórico, pausa ou encerra o monitoramento".

## 2. Fora do escopo

- transição para `COMPLETED` — não existe produtor algum dessa transição ainda em nenhum processo; fica pra quando o produto definir o que significa "viagem concluída" (ex.: passou a data de volta sem cancelamento);
- transição para `EXPIRED` — já é responsabilidade exclusiva de `reconcileExpiredWatches` (scheduler, SPEC-002), não uma ação de usuário;
- qualquer efeito sobre o agendamento do `SearchTarget` associado — `SearchTarget` é agendado de forma independente de qualquer Watch individual (pode haver outros Watches ativos apontando pro mesmo target), então pausar/encerrar um Watch nunca cancela nem adia a próxima consulta do target;
- edição de regras de alerta, canal ou datas de um Watch existente.

## 3. Pré-condições

- usuário autenticado (`SessionAuthGuard`);
- Watch pertence ao usuário autenticado.

## 4. Entrada

```
POST /v1/watches/:id/pause
POST /v1/watches/:id/reactivate
POST /v1/watches/:id/cancel
```

Sem corpo. `:id` é o UUID do Watch.

## 5. Validação

- `:id` deve ser um UUID sintaticamente válido;
- Watch com esse id deve existir e pertencer ao usuário autenticado — as duas condições produzem o mesmo erro (§8), pelo mesmo motivo de SPEC-001 §8: não expor a um usuário se um Watch de outra pessoa existe.

## 6. Comportamento

Tabela de transições válidas (idêntica a `DOMAIN.md` §3.2, restrita às ações desta spec):

| Ação         | Origem aceita     | Destino     |
| ------------ | ----------------- | ----------- |
| `pause`      | `ACTIVE`          | `PAUSED`    |
| `reactivate` | `PAUSED`          | `ACTIVE`    |
| `cancel`     | `ACTIVE`,`PAUSED` | `CANCELLED` |

1. Autenticar.
2. Buscar o Watch por id; se não existir ou não pertencer ao usuário, retornar `WATCH_NOT_FOUND`.
3. Se o status atual já é igual ao destino da ação (ex.: `pause` num Watch já `PAUSED`), retornar sucesso sem escrever nada — ver §9 sobre por que isso é tratado como idempotente e não como conflito.
4. Se o status atual não está na coluna "Origem aceita" da ação, retornar `INVALID_WATCH_TRANSITION` (cobre tentar agir sobre `COMPLETED`/`EXPIRED`, ou `reactivate`/`cancel` incoerentes).
5. Aplicar a transição de forma condicional: `UPDATE` com `WHERE id = :id AND status IN (<origens aceitas>)`, incrementando `version`. Se nenhuma linha for afetada, outra requisição venceu a corrida entre o passo 2 e este: reler o status atual — se já é o destino desejado, é a mesma ação vencendo a corrida (sucesso idempotente, ver §9); qualquer outro status é `INVALID_WATCH_TRANSITION` de verdade.
6. Retornar o Watch atualizado na mesma forma da listagem (`WatchListItem`, sem SPEC própria — ver `packages/contracts/src/watches/list-watches.ts`).

## 7. Resposta de sucesso

Status `200 OK`. Mesmo formato de um item de `GET /v1/watches` (`watchListItemSchema`), refletindo o novo `status`.

## 8. Erros

| Status | Código                     | Situação                                     |
| -----: | -------------------------- | -------------------------------------------- |
|    400 | `INVALID_WATCH_ID`         | `:id` não é um UUID válido                   |
|    401 | `UNAUTHENTICATED`          | sessão ausente/inválida                      |
|    404 | `WATCH_NOT_FOUND`          | Watch inexistente ou não pertence ao usuário |
|    409 | `INVALID_WATCH_TRANSITION` | status atual não permite a ação pedida       |

## 9. Idempotência e concorrência

- Chamar a mesma ação duas vezes quando o Watch já está no estado de destino é sucesso (200, sem escrita na segunda vez) — não conflito. Decisão explícita desta spec (não estava coberta em `DOMAIN.md`, que só define os arcos válidos do estado, não a semântica HTTP de repetir uma ação): um botão "Pausar" clicado duas vezes, ou um retry de rede depois de um timeout, não deve virar erro pro usuário. Diferente é tentar uma transição genuinamente inválida (`reactivate` num Watch `CANCELLED`), que continua sendo `409`.
- A escrita em si usa `UPDATE ... WHERE status IN (...)` condicional (não "ler status, decidir em código, depois escrever"), então uma corrida real entre duas requisições concorrentes nunca deixa o Watch num estado intermediário nem aplica uma transição inválida. Se a mesma ação for disparada duas vezes de verdade em paralelo, a perdedora da corrida relê o estado após a escrita da vencedora: se já é o destino desejado, devolve sucesso idempotente igual à vencedora (200 para as duas chamadas); só devolve `409` se o estado final não corresponde nem à origem nem ao destino esperados (conflito genuíno com uma ação diferente).
- `version` é incrementado a cada transição bem-sucedida (campo já existe no schema, sem uso até agora).

## 10. Eventos

Nenhum. `SearchTarget` é agendado independente de qualquer Watch (pode haver outros Watches ativos no mesmo target), e `evaluatePriceObservedJob` (SPEC-005, `apps/alert-worker/src/evaluate.ts`) já ignora Watches fora de `ACTIVE` antes de avaliar qualquer regra — a mudança de status é suficiente por si só, sem precisar propagar um evento para nenhum outro processo.

## 11. Critérios de aceitação

- AC-001: `pause` num Watch `ACTIVE` retorna `200` com `status=PAUSED`.
- AC-002: `reactivate` num Watch `PAUSED` retorna `200` com `status=ACTIVE`.
- AC-003: `cancel` num Watch `ACTIVE` ou `PAUSED` retorna `200` com `status=CANCELLED`.
- AC-004: repetir a mesma ação quando o Watch já está no destino é `200` idempotente, sem alterar `version`.
- AC-005: `pause`/`reactivate`/`cancel` num Watch `COMPLETED` ou `EXPIRED` retorna `409`; `reactivate`/`pause` num Watch `CANCELLED` retorna `409`.
- AC-006: agir sobre Watch de outro usuário retorna `404`, nunca `403` (não confirma existência).
- AC-007: `:id` mal formado retorna `400` antes de qualquer consulta ao banco.
- AC-008: um Watch pausado não é mais avaliado por regras de alerta (cobertura já existe em `evaluate.test.ts`, referenciada aqui — não duplicar).

## 12. Testes e evals

- e2e (Testcontainers) cobrindo AC-001 a AC-007 via requisição HTTP real, mesmo padrão de `watches.e2e.spec.ts`;
- integração da transição condicional sob concorrência (duas chamadas simultâneas da mesma ação válida — uma decide via `count()`, a outra recebe o resultado idempotente do passo 3, nenhuma quebra);
- `EVAL-SEC-002` (isolamento entre usuários), reaproveitando o padrão de `auth.e2e.spec.ts`.

## 13. Observabilidade

- contador `watch_lifecycle_transition_total{action,result}` — `action` ∈ `pause`/`reactivate`/`cancel`, `result` ∈ `success`/`idempotent_noop`/`not_found`/`invalid_transition`;
- log com `watch_id`, `action` e resultado.

**Lacuna declarada (achado de review)**: esta seção originalmente afirmava que existia um `correlation_id` "já existente no pipeline HTTP" — falso, verificado no código: `apps/api` não tem middleware/interceptor de correlação por requisição em lugar nenhum (só os processos assíncronos — scheduler, jobs, outbox — geram e propagam `correlationId`). Gerar e propagar um id de correlação por requisição HTTP é peça de infraestrutura própria, atravessa todos os endpoints da API, não só Watches — não faz sentido construir isso apenas para esta spec. Fica registrado aqui como pendência para uma spec/ADR própria (mesmo padrão de ADR-007), não escondido atrás de uma afirmação que não corresponde ao código.

## 14. Performance

Mesma meta de SPEC-001 §14 (p95 abaixo de 500 ms em staging) — a operação é um `SELECT` + `UPDATE` condicional por chave primária, sem nova tabela nem full scan.

## 15. Rollout e rollback

Sem migração de schema (campos `status`/`version` já existem). Sem feature flag — reaproveita o guard e o módulo de Watches já em produção; reverter é reverter o deploy do binário.
