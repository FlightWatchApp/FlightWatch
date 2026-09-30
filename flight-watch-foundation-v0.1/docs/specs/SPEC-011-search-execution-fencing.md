# SPEC-011 — Fencing de SearchExecution

Status: draft para aprovação
Versão: 0.1
Owner: Reliability
Dependências: SPEC-002, SPEC-003, SPEC-004

## 1. Objetivo

Impedir que uma `SearchExecution` reconciliada como abandonada (`reconcileAbandonedSearchExecutions`, SPEC-002 §5/§8) ainda receba uma escrita terminal do worker original que ela supostamente abandonou — fechando o HIGH finding de `OBSERVABILITY-CODE-REVIEW-ROUND-2.md`: "Reconciliação de execução não possui fencing/lease ownership".

## 2. Fora do escopo

- mudar a janela de staleness usada pela reconciliação (`staleBeforeMs`, configuração existente);
- fencing de outras entidades (Watch, AlertRule) — não têm o mesmo padrão de "um único worker é dono por vez";
- detecção de worker morto via heartbeat contínuo — o mecanismo aqui é reativo (a próxima escrita falha se o lease não é mais válido), não proativo.

## 3. Problema concreto

1. Scheduler cria `SearchExecution` (`SCHEDULED`).
2. Worker reivindica via `claimSearchExecutionForRunning` (`RUNNING`).
3. Worker chama o provedor — pode demorar (timeout longo, provedor lento).
4. Enquanto isso, `reconcileAbandonedSearchExecutions` roda no scheduler e, por `createdAt` antigo, marca a mesma execução como `RETRYABLE_FAILURE` — presumindo (incorretamente, neste caso) que o worker morreu.
5. O target volta a ficar elegível; uma nova `SearchExecution` pode ser criada e processada por outro worker.
6. O worker original, que na verdade não morreu, termina a chamada ao provedor e chama `markSearchExecutionFailed`/`persistPriceObservationSuccess`/`persistNoOffersResult` — hoje esses três fazem `UPDATE ... WHERE id = ?` **sem checar status nem posse**, então a escrita passa e pode sobrescrever o resultado da segunda tentativa (mais nova e correta) com o resultado da primeira (mais antiga e órfã).

## 4. Comportamento

### Lease token

`SearchExecution` ganha `leaseToken String?`. Só existe entre o claim e a resolução (sucesso, falha ou reconciliação).

1. `claimSearchExecutionForRunning` gera um `leaseToken` novo (`randomUUID()`) e grava junto da transição para `RUNNING`. Devolve a execução (já inclui o `leaseToken`, usado pelo chamador nas escritas seguintes).
2. Toda escrita terminal (`markSearchExecutionFailed`, `persistPriceObservationSuccess`, `persistNoOffersResult`) passa a exigir `leaseToken` como parâmetro e aplica `UPDATE ... WHERE id = ? AND "leaseToken" = ?`. Se `count === 0`, a execução não pertence mais a quem está tentando escrever — lança `StaleLeaseError` em vez de escrever.
3. `reconcileAbandonedSearchExecutions`, ao marcar `RETRYABLE_FAILURE`, zera o `leaseToken` (`null`) na mesma escrita — isso é o fencing em si: qualquer escrita posterior do worker original, carregando o token antigo, nunca mais casa com `WHERE leaseToken = ?`.

### Reação do worker a `StaleLeaseError`

O price-worker (`processPriceCheckJob`) captura `StaleLeaseError` nos pontos onde essas três funções são chamadas e trata como um caminho terminal benigno: não relança (a execução já não é mais dele — relançar geraria retry do BullMQ para um trabalho que não tem mais dono), incrementa a métrica dedicada (§8) e retorna. O resultado da chamada ao provedor é descartado — a `SearchExecution` nova, criada depois da reconciliação, é quem vai produzir a observação real.

## 5. Validação

- `leaseToken` é opaco (UUID v4), nunca exposto em resposta HTTP nem em log (não é segredo, mas não tem valor para ninguém fora do worker que o possui).

## 6. Erros

`StaleLeaseError` (novo, `packages/database`) — não é um erro HTTP (nada aqui é exposto via API pública); é um sinal interno consumido pelo price-worker.

## 7. Idempotência e concorrência

- A escrita condicional (`WHERE id AND leaseToken`) é exatamente o mesmo padrão já usado em `transitionWatchStatus` (SPEC-008) e `claimSearchExecutionForRunning`/`claimNotificationDeliveryForSending` — `UPDATE` condicional, nunca "ler-decidir-escrever".
- Duas escritas terminais concorrentes para a mesma execução (não deveria acontecer sob operação normal, já que só um worker reivindica via `RUNNING`, mas o teste de regressão cobre isso): a primeira consome a lease (a escrita muda o estado); a segunda não encontra mais o `leaseToken` esperado no momento em que tenta escrever seu próprio resultado terminal, porque a primeira já resolveu a linha para um status terminal — normal, não é o cenário do fencing propriamente dito, só reforça que a escrita é sempre condicional.

## 8. Observabilidade

- contador `search_execution_stale_lease_rejections_total{action}` — `action` ∈ `mark_failed`/`persist_no_offers`/`persist_success` — incrementado sempre que `StaleLeaseError` é capturado no price-worker;
- log `search_execution_stale_lease_rejected` com `searchExecutionId`, `action`, `correlationId` (SPEC-013).

## 9. Critérios de aceitação

- AC-001: fluxo normal (sem reconciliação no meio) não muda de comportamento — todas as escritas terminais continuam funcionando com o lease correto.
- AC-002: se a execução é reconciliada (lease zerado) entre o claim e a escrita terminal do worker original, a escrita original é rejeitada (`StaleLeaseError`) e não sobrescreve o estado da execução.
- AC-003: uma segunda `SearchExecution`, criada depois da reconciliação, processa e persiste normalmente — o sistema se recupera, só o resultado órfão é descartado.
- AC-004: `persistPriceObservationSuccess` rejeitada por lease inválido não cria `PriceObservation` nem evento de outbox — tudo ou nada dentro da mesma transação.

## 10. Testes e evals

- integração (Testcontainers) simulando a corrida: claim → reconciliar manualmente (zerar o lease) → tentar as três escritas terminais com o lease antigo → todas rejeitadas, nada persistido;
- teste de que uma nova execução pós-reconciliação persiste normalmente;
- teste de que o fluxo feliz (sem reconciliação) não regride.

## 11. Rollout e rollback

Migração aditiva (`leaseToken String?` em `search_executions`, sem default, sem backfill necessário — execuções já terminais não usam mais o campo). Sem feature flag.
