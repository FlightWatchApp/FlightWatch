# SPEC-013 — Correlação ponta a ponta

Status: draft para aprovação
Versão: 0.1
Owner: Reliability
Dependências: nenhuma (transversal)

## 1. Objetivo

Fechar duas lacunas de diagnóstico encontradas na revisão de SPEC-008/009:

1. `apps/api` não tem nenhum `correlation_id` por requisição HTTP — as specs (SPEC-008/009 §13, antes da correção) chegaram a afirmar que esse mecanismo já existia, o que era falso.
2. O `correlationId` por execução assíncrona **já existe** (gerado em `apps/scheduler/src/tick.ts`, propagado por `SearchExecution`/`PriceObservation`/jobs BullMQ até `apps/notification-worker`), mas nunca é de fato escrito em nenhum log — os `logEvent` de falha de job em cada worker (`*_job_failed`) omitem o campo mesmo ele estando disponível em `job.data.correlationId`.

## 2. Fora do escopo

- unificar as duas correlações num único id global — são perguntas diferentes por natureza (ver §3) e forçar uma só complicaria sem ganho real;
- correlação entre processos via um coletor central (OpenTelemetry/Jaeger/etc.) — os logs continuam sendo a única saída; isso é só garantir que o campo certo está em cada linha;
- adicionar `logEvent` em pontos que hoje não logam nada (ex.: sucesso de cada job individual em `evaluate.ts`/`process-job.ts`) — fora do que foi pedido; o gap é "o campo existe mas não é escrito onde já se loga", não "logar mais coisas nesta spec".

## 3. Por que duas correlações, não uma

- **Correlação de requisição HTTP**: "por que essa chamada à API falhou" — escopo é uma única requisição/resposta em `apps/api`.
- **Correlação de execução assíncrona**: "o que aconteceu com esta verificação de preço, do agendamento até (talvez) um alerta" — escopo é um `SearchExecution` e tudo que ele gera a jusante (`PriceObserved` → avaliação de regra → `NotificationRequested`).

Uma `SearchTarget` é compartilhada entre usuários e watches (ADR-005) e verificada repetidamente ao longo de semanas — não há uma "requisição HTTP de origem" única para correlacionar, mesmo que quiséssemos. As duas correlações continuam com nomes de campo iguais (`correlationId`) porque representam o mesmo conceito (uma trilha de log), só que em dois escopos diferentes.

## 4. Comportamento

### HTTP (`apps/api`)

Middleware Nest (`CorrelationMiddleware`), registrado globalmente em `AppModule`, executado antes de guards/pipes:

1. Lê o header `x-correlation-id` da requisição. Se presente, sintaticamente razoável (string, 1–128 caracteres, sem caractere de controle) e não vazio, usa esse valor — permite que um cliente/gateway já correlacione a chamada por fora.
2. Caso contrário, gera um novo (`randomUUID()`).
3. Grava em `request.correlationId` (mesmo padrão de `request.userId` no `SessionAuthGuard`, SPEC-007).
4. Ecoa o valor no header de resposta `x-correlation-id` — o cliente sempre sabe o id usado, mesmo quando gerou o request sem informar um.

Novo decorator `@CurrentCorrelationId()` (mesmo padrão de `@CurrentUser()`) para os controllers lerem `request.correlationId`.

`watches.controller.ts` e `auth.controller.ts` passam a repassar `correlationId` para os métodos de serviço correspondentes; `watches.service.ts`/`auth.service.ts` incluem o campo em todo `logEvent` que já emitem hoje (`watch_lifecycle_transition`, `watch_detail_fetch`, `auth_verify_email`, `auth_resend_verification`, falha de envio de e-mail de verificação).

### Assíncrono (scheduler → price-worker → alert-worker → notification-worker)

Cada worker já recebe `correlationId` em `job.data` (confirmado por grep: `apps/scheduler/src/tick.ts`, `apps/price-worker/src/process-job.ts`, `apps/alert-worker/src/evaluate.ts`). O único ajuste necessário é passar esse valor, que já está disponível, para o `logEvent` de falha de job que cada `main.ts` já emite:

- `apps/price-worker/src/main.ts` (`price_worker_job_failed`);
- `apps/alert-worker/src/main.ts` (`alert_worker_job_failed`);
- `apps/notification-worker/src/main.ts` (evento equivalente).

`apps/scheduler/src/main.ts` não ganha esse campo no log de tick (`scheduler_tick_completed`/`scheduler_tick_failed`) — um tick cria N execuções, cada uma com seu próprio `correlationId`; não há um id único de tick para logar.

## 5. Validação

- `x-correlation-id` recebido de fora: rejeitar valores maiores que 128 caracteres ou contendo caracteres de controle (`\r`, `\n`, etc. — nunca refletir texto não sanitizado num header de resposta), gerando um novo id nesse caso em vez de propagar o valor suspeito.

## 6. Erros

Nenhum novo erro HTTP. Um `x-correlation-id` de entrada inválido não bloqueia a requisição — só é substituído por um gerado.

## 7. Observabilidade

Esta spec É a mudança de observabilidade — não introduz métrica nova, só o campo `correlationId`/header `x-correlation-id` nos logs e respostas HTTP já existentes.

## 8. Critérios de aceitação

- AC-001: toda resposta de `apps/api` inclui o header `x-correlation-id`.
- AC-002: um `x-correlation-id` enviado pelo cliente é ecoado de volta sem alteração, quando válido.
- AC-003: um `x-correlation-id` inválido (muito longo, com caractere de controle) é substituído por um gerado, não propagado.
- AC-004: `watch_lifecycle_transition`, `watch_detail_fetch`, `auth_verify_email` e `auth_resend_verification` incluem `correlationId` no log.
- AC-005: `price_worker_job_failed`, `alert_worker_job_failed` e o log de falha equivalente do notification-worker incluem `correlationId` quando o job tem um.

## 9. Testes e evals

- e2e (`apps/api`) confirmando os headers de request/resposta (AC-001 a AC-003) e a presença do campo nos logs capturados (AC-004, via inspeção do `stdout` ou de um `logEvent` mockável);
- teste unitário do middleware isolando a validação de header de entrada.

## 10. Rollout e rollback

Sem migração de schema. Sem feature flag — middleware global, mesmo padrão de guard/filter já em produção.
