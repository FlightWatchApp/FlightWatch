# CODE REVIEW — OBSERVABILITY

## 1. Executive Summary

A implementação de observabilidade está compilável e os gates automatizados passam. As correções de `/metrics`, timeout do `/health`, lag de alertas/entregas e cardinalidade dos labels estão coerentes com o código atual.

O quality gate, porém, não passa para produção. A revisão adversarial encontrou dois blockers de confiabilidade que não são resolvidos pelas métricas: (1) a reconciliação pode assumir uma execução `RUNNING` ainda viva, permitindo corrida entre o worker original e um retry; (2) uma entrega `SENDING` pode ficar presa para sempre se o processo cair depois do envio externo e antes da confirmação no banco. Ambos afetam idempotência e podem causar perda, duplicação ou paralisação silenciosa do fluxo.

## 2. Findings

### [HIGH] Reconciliação de execução não possui fencing/lease ownership

Arquivo: `packages/database/src/scheduler-repository.ts:97-109`, `packages/database/src/price-observation-repository.ts:30-44`

Problema: `reconcileAbandonedSearchExecutions` altera qualquer `SCHEDULED` ou `RUNNING` cujo `createdAt` seja antigo. O worker, após `claimSearchExecutionForRunning`, não recebe nem apresenta um token de lease nas escritas finais.

Evidência: o scheduler usa `createdAt` também para `RUNNING` e executa `updateMany`; o worker finaliza por apenas `searchExecutionId`. Um worker que esteja aguardando o provider pode ser reconciliado para `RETRYABLE_FAILURE`, enquanto sua chamada externa ainda está ativa. Depois, ele pode persistir sucesso/falha sem comprovar que ainda é o dono.

Impacto: duas chamadas lógicas para o mesmo target, observação tardia sobrescrevendo o resultado de uma tentativa posterior, e retry concorrente. Os testes cobrem a transição de estado, mas não a corrida worker-vs-reconciliador.

Correção: adicionar token/owner de lease gerado no claim, limpar/rotacionar o token na reconciliação e exigir `id + status + leaseToken` em todas as transições finais. Para chamadas externas ambíguas, combinar isso com idempotência do provider.

### [HIGH] Entrega `SENDING` pode ficar órfã após crash

Arquivo: `packages/database/src/notification-delivery-repository.ts:77-88`, `apps/notification-worker/src/process-job.ts:122-163`

Problema: o worker grava `SENDING` antes de chamar o provider. Se o processo cair depois que o provider aceitou o e-mail e antes de `markNotificationDeliveryResult`, um retry encontra `SENDING`, `claimNotificationDeliveryForSending` retorna `null` e o job termina sem marcar `DELIVERED` nem `FAILED`.

Impacto: o `AlertEvent` permanece `QUEUED` e a entrega fica presa indefinidamente. Reivindicar automaticamente sem consultar o provider também pode duplicar a mensagem; portanto, não é seguro corrigir apenas trocando `SENDING` por claimável.

Correção: implementar recuperação explícita de leases `SENDING` com timeout, status query/idempotency key no provider e estado terminal auditável. O provider real precisa garantir idempotência por `deliveryKey` ou existir uma política explícita de resolução de timeout ambíguo.

### [MEDIUM] `METRICS_HOST` permite exposição acidental fora do loopback

Arquivo: `apps/api/src/main.ts:9-10`, `packages/observability/src/metrics-server.ts:18-20`

Problema: o default é seguro (`127.0.0.1`), mas qualquer configuração pode usar `0.0.0.0`/`::` sem uma segunda confirmação ou allowlist.

Impacto: `/metrics` contém contadores operacionais e métricas default do processo; uma configuração de deploy equivocada pode expô-los na interface pública.

Correção: validar hosts permitidos ou exigir uma flag explícita para bind wildcard, além de ACL/firewall interno. O default atual é adequado para execução local.

### [LOW] Teste da API não cobre o listener dedicado real

Arquivo: `apps/api/src/observability/health.e2e.spec.ts:48-62`

Problema: o teste verifica `metrics.registry.metrics()` diretamente. Isso valida o conteúdo, mas não prova que o `main.ts` sobe o listener na porta configurada, isola `/metrics` da porta pública e fecha ambos no shutdown.

Impacto: uma regressão de wiring/lifecycle poderia passar na suíte atual.

Correção: adicionar teste de integração do bootstrap/listener dedicado ou extrair um factory testável para o lifecycle.

### [LOW] Semântica de reconciliação é de ações, não de entidades únicas

Arquivo: `apps/scheduler/src/main.ts:58-63`, `apps/scheduler/src/metrics.ts:39-43`

Problema: `abandoned_lease`, `retry_exhausted` e `watch_expired` são incrementados como ações realizadas. A mesma execução pode ser contada como `abandoned_lease` em um tick e `retry_exhausted` em outro; `watch_expired` é transição de Watch, não de lease.

Impacto: somar o contador como “execuções reconciliadas únicas” produz interpretação errada. Não há dupla contagem da mesma ação dentro de um único `runSchedulerTick`.

Correção: manter a métrica, mas documentá-la como `reconciliation_actions_total` ou declarar explicitamente que ela mede transições por motivo e pode contar a mesma entidade em fases diferentes.

## 3. Regression Audit

### API

PASS para os testes atuais. `/health` permanece público; `/metrics` é iniciado em listener separado e o startup falha fechado se a porta de métricas ou a porta pública não puder ser aberta. O teste de HTTP do `/metrics` dedicado ainda é uma lacuna, registrada acima.

### Scheduler

FAIL para produção por causa do risco de fencing descrito no primeiro finding. A seleção usa lock, constraint de idempotência e outbox transacional, mas isso não protege uma execução `RUNNING` contra um reconciliador atrasado.

### Price Worker

FAIL para produção pelo mesmo risco de lease: o claim concorrente é atômico e a observação tem `observationKey` única, mas as transições posteriores não validam ownership da execução.

### Alert Worker

PASS nos testes e na semântica de métricas. A regra é contada uma vez por resultado; AlertEvent/outbox são criados atomicamente; deduplicação usa constraint persistente; cooldown é serializado pela trava da regra.

### Notification Worker

FAIL para produção pelo estado `SENDING` órfão após crash. A reivindicação concorrente evita duas chamadas simultâneas no caso normal, mas ainda não há recuperação segura de falha entre provider e banco.

## 4. Metrics Audit

| Métrica                                             | Tipo      | Labels                                 | Semântica correta? | Cardinalidade              | Problemas                                                                                      |
| --------------------------------------------------- | --------- | -------------------------------------- | ------------------ | -------------------------- | ---------------------------------------------------------------------------------------------- |
| `watch_create_total`                                | Counter   | `result`                               | Sim                | Baixa                      | Resultados derivados de enum de domínio                                                        |
| `auth_register_total`                               | Counter   | `result`                               | Sim                | Baixa                      | Resultados derivados de códigos de erro                                                        |
| `auth_login_total`                                  | Counter   | `result`                               | Sim                | Baixa                      | Resultados derivados de códigos de erro                                                        |
| `scheduler_targets_scanned_total`                   | Counter   | nenhum                                 | Parcial            | Baixa                      | Conta targets elegíveis retornados, não linhas examinadas                                      |
| `scheduler_jobs_created_total`                      | Counter   | `result`, `reason`                     | Sim                | Baixa                      | Só o caminho de sucesso é incrementado no caller atual                                         |
| `scheduler_tick_errors_total`                       | Counter   | `reason`                               | Sim                | Baixa                      | Sem classificação mais granular                                                                |
| `scheduler_reconciliations_total`                   | Counter   | `reason`                               | Parcial            | Baixa                      | Mede ações/transições, não entidades únicas                                                    |
| `scheduler_targets_delayed`                         | Gauge     | `priority`                             | Sim                | Fechada                    | `STANDARD/HIGH/LOW/OTHER` normalizados                                                         |
| `provider_call_total`                               | Counter   | `provider`, `result`                   | Sim                | Baixa no processo          | `circuit_open`/`local_rate_limited` representam tentativas bloqueadas, conforme SPEC-003       |
| `provider_call_duration_seconds`                    | Histogram | `provider`                             | Sim                | Baixa                      | Mede somente chamadas externas; timer é encerrado em sucesso e erro                            |
| `offers_received_total`                             | Counter   | nenhum                                 | Sim                | Baixa                      | Ofertas recebidas antes do filtro                                                              |
| `offers_eligible_total`                             | Counter   | nenhum                                 | Sim                | Baixa                      | Resultado de `countEligibleOffers`/`isOfferEligible`                                           |
| `circuit_breaker_open`                              | Gauge     | `provider`                             | Sim                | Baixa                      | Estado 0/1 atualizado nos caminhos relevantes                                                  |
| `price_observation_total`                           | Counter   | `result`                               | Sim                | Baixa                      | `success`, `no_offers`, `idempotent_replay`                                                    |
| `alert_rules_evaluated_total`                       | Counter   | `type`, `result`                       | Sim                | Baixa                      | Resultados mutuamente exclusivos                                                               |
| `alert_events_total`                                | Counter   | `outcome`                              | Sim                | Baixa                      | `queued`, `suppressed`, `idempotent_replay`                                                    |
| `alert_event_lag_seconds`                           | Histogram | nenhum                                 | Sim                | Baixa                      | Mede `observedAt → createdAt`; replay não observa novo lag                                     |
| `alert_worker_pages_processed_total`                | Counter   | nenhum                                 | Sim                | Baixa                      | Conta páginas não vazias; não conta query sentinela vazia                                      |
| `alert_worker_watch_skipped_total`                  | Counter   | `reason`                               | Sim                | Baixa                      | Atualmente `not_active`                                                                        |
| `notification_deliveries_total`                     | Counter   | `channel`, `status`, `templateVersion` | Sim após correção  | Fechada no caminho métrico | `channel` e versão inválidos viram `UNKNOWN`; o payload ainda precisa de validação de contrato |
| `notification_delivery_lag_seconds`                 | Histogram | `channel`                              | Sim                | Fechada                    | Só observa desfecho terminal, não cada retry                                                   |
| `notification_delivery_attempts_total`              | Counter   | `channel`                              | Sim                | Fechada                    | Claim aceito, antes do provider                                                                |
| `notification_duplicate_deliveries_prevented_total` | Counter   | nenhum                                 | Parcial            | Baixa                      | Conta claims recusados; inclui redelivery já resolvido e concorrência perdida                  |

As métricas default `flight_watch_*` vêm de `collectDefaultMetrics` por Registry e não carregam PII, user ID, watch ID, rota ou e-mail. Os labels de provider/error são controlados pelo processo e os labels de fila foram limitados no caminho de métricas; ainda falta validação runtime dos payloads da fila.

## 5. Security & Privacy

- `/metrics`: não é mais rota do Fastify público; o default do listener dedicado é `127.0.0.1`. O override `METRICS_HOST` exige controle de deploy/rede.
- `/health`: público na API, retorna somente `ok`/`unhealthy`; a query usa `statement_timeout` do PostgreSQL e timeout/max-wait do Prisma, em vez de apenas abandonar um Promise.
- Logs: os call sites atuais não enviam e-mail, destino, token ou payload de provider. A sanitização recursiva cobre campos sensíveis, `Error`, `cause`, arrays e referências circulares. A blacklist não é uma allowlist universal; novos call sites devem continuar sendo revisados.
- Métricas: não há PII nos labels observados. `templateVersion` foi limitado a versões inteiras de 1 a 100 ou `UNKNOWN`.
- Endpoints: `/metrics` retorna erro genérico em falha de serialização; `/health` não devolve detalhes internos.

## 6. Idempotency & Concurrency

- Scheduler: `FOR UPDATE SKIP LOCKED`, chave de execução única e outbox transacional são corretos no caminho normal. Falta fencing para a reconciliação de uma execução viva.
- Price observation: claim atômico e `observationKey` única evitam redelivery duplicado, mas não impedem uma escrita tardia de um worker cujo estado foi reconciliado por outro processo.
- Alert event: `deduplicationKey` persistente, retry de unique constraint, lock da regra e criação atômica do outbox preservam o comportamento idempotente. O lag não é contado em replay.
- Notification delivery: `deliveryKey` e claim condicional evitam concorrência normal e incrementam tentativa somente após claim. Falta recuperação de `SENDING` em crash/timeout ambíguo; portanto, a garantia atual não é completa.

## 7. Tests Executed

| COMMAND                                                     | RESULT                                                                                                                                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`                                         | PASS — todos os arquivos formatados                                                                                                                                        |
| `pnpm lint`                                                 | PASS — 13/13 tarefas                                                                                                                                                       |
| `pnpm typecheck`                                            | PASS — 20/20 tarefas                                                                                                                                                       |
| `pnpm build`                                                | PASS — 13/13 tarefas                                                                                                                                                       |
| `pnpm test`                                                 | PASS — 20/20 tarefas; inclui API 38, alert-worker 11, notification-worker 9, price-worker 11, scheduler 6, database 23 e observability 17 testes, além dos demais packages |
| `pnpm --filter @flight-watch/notification-worker test`      | PASS — 9 testes                                                                                                                                                            |
| `pnpm --filter @flight-watch/notification-worker typecheck` | PASS                                                                                                                                                                       |

Também foram verificados globalmente os call sites de `persistPriceObservationSuccess`, `persistNoOffersResult` e `markSearchExecutionFailed`; não há call site de produção esquecido segundo a busca e o typecheck.

## 8. Fixes Applied

- API: movi `/metrics` para listener dedicado configurável, mantive o bind padrão em loopback, adicionei cleanup no startup failure e graceful shutdown.
- API: substituí o timeout que apenas abandonava a Promise por transação com `SET LOCAL statement_timeout`, `maxWait` e timeout do Prisma.
- Alert worker: passei a calcular lag usando `PriceObservation.observedAt` persistido e o `createdAt` do AlertEvent criado; replay não gera observação falsa e lag negativo é limitado a zero.
- Alert worker: `alert_worker_pages_processed_total` agora conta somente páginas não vazias.
- Notification worker: lag é observado somente no resultado terminal, não em cada retry.
- Notification worker: labels de canal e versão de template são normalizados para conjunto fechado antes de entrar no Registry.

## 9. Remaining Risks

- Fencing ausente em `SearchExecution` durante reconciliação de leases.
- Recuperação ausente de `NotificationDelivery.SENDING` após crash/timeout ambíguo.
- Payloads de BullMQ são aceitos por cast TypeScript, sem validação runtime completa; a proteção de cardinalidade não substitui validação de negócio.
- `METRICS_HOST` pode ser configurado de forma insegura; o código não impõe allowlist de bind.
- `/health` do listener dedicado usa `isHealthy: () => true`; ele é liveness, não readiness de Postgres/Redis. A API pública tem verificação de banco, mas os workers não têm readiness real.
- O e2e da API ainda não instancia o `main.ts` real para verificar porta dedicada e shutdown.

# FINAL QUALITY GATE

FAIL

Blockers:

1. Falta fencing/ownership na reconciliação de `SearchExecution`, com risco de execução duplicada e escrita tardia.
2. Falta recuperação segura de entrega `SENDING` após crash entre o provider e a confirmação no banco.
