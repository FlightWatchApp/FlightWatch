# SPEC-012 — Recuperação de notificação presa em SENDING

Status: draft para aprovação
Versão: 0.1
Owner: Reliability
Dependências: SPEC-006

## 1. Objetivo

Garantir que uma `NotificationDelivery` nunca fique presa em `SENDING` para sempre — fechando o HIGH finding de `OBSERVABILITY-CODE-REVIEW-ROUND-2.md`: "Entrega SENDING pode ficar órfã após crash". Hoje, se o processo cai entre o provedor aceitar o e-mail e `markNotificationDeliveryResult` gravar o resultado, nenhum código nunca mais examina aquela linha — o `AlertEvent` fica `QUEUED` indefinidamente e o usuário nunca é avisado, sem nenhum erro visível.

## 2. Fora do escopo

- recuperação de entregas em qualquer outro canal além de `EMAIL` (é o único canal que existe);
- reenvio automático sem limite — a reconciliação usa `attempt` (já existente) para não tentar para sempre;
- SLA formal de tempo até a recuperação — o timeout é placeholder, ajustável quando houver operação real.

## 3. Por que reenviar às cegas seria inseguro (e o que muda isso)

Se o e-mail original de fato saiu pelo provedor antes do crash, um reenvio ingênuo duplicaria a mensagem — o usuário recebe o mesmo alerta duas vezes. A única forma seteúra de reenviar é se o canal de envio for **idempotente por `idempotencyKey`**: reenviar com a mesma chave não duplica, porque o provedor (real ou simulado) reconhece que já processou aquela chave.

`EmailMessage.idempotencyKey` já existe e já recebe `deliveryKey` (`packages/notifications/src/email/port.ts`, uso em `apps/notification-worker/src/process-job.ts`) — mas isso nunca foi um contrato explícito, e a única implementação hoje (`InMemoryEmailSender`) não o respeita: cada chamada a `send()` é gravada em `.sent` incondicionalmente, mesmo com a mesma `idempotencyKey`. Esta spec torna a idempotência um requisito formal da porta `EmailSender` e corrige o simulado para cumpri-lo — sem isso, a recuperação proposta abaixo não seria segura nem testável.

## 4. Comportamento

### Contrato da porta `EmailSender` (mudança)

`packages/notifications/src/email/port.ts`: documentar que toda implementação de `EmailSender.send()` deve ser idempotente por `idempotencyKey` — uma segunda chamada com a mesma chave devolve o mesmo resultado (ou um resultado equivalente) sem enviar uma segunda mensagem real. `InMemoryEmailSender` passa a manter um cache `idempotencyKey -> EmailSendResult`; uma chamada repetida devolve o resultado cacheado e **não** adiciona uma segunda entrada em `.sent`.

### Reivindicação tolerante a SENDING obsoleto

`claimNotificationDeliveryForSending` (hoje só aceita `PENDING`/`RETRYABLE_FAILURE`) passa a também aceitar `SENDING` cujo `updatedAt` seja mais antigo que `STALE_SENDING_THRESHOLD_MS` (placeholder inicial: 5 minutos — bem acima da latência esperada de um envio de e-mail real). Isso cobre o caso em que o **mesmo job BullMQ** é redelivered (por stalled-job detection do próprio BullMQ) depois de o worker ter caído no meio do envio.

### Reconciliação explícita (novo processo periódico)

BullMQ só redelivera um job que ele próprio considera parado; se o job já tinha sido marcado concluído do lado do BullMQ antes do crash (janela pequena, mas existe), nada o traz de volta. Por isso, `apps/notification-worker` ganha um segundo laço periódico (mesmo padrão de `setInterval` do scheduler, SPEC-002), independente do `Worker` do BullMQ:

1. `reconcileStaleSendingNotificationDeliveries(tx, staleBeforeMs)`: `UPDATE notification_deliveries SET status = 'RETRYABLE_FAILURE', "errorCode" = 'STALE_SENDING_LEASE' WHERE status = 'SENDING' AND "updatedAt" < now() - staleBeforeMs RETURNING id, "alertEventId", channel, "templateVersion"` — atômico, devolve exatamente as linhas que essa chamada resolveu (sem corrida com uma segunda reconciliação concorrente, porque a condição `WHERE status = 'SENDING'` só é verdadeira uma vez).
2. Para cada linha devolvida, o worker publica um novo job `NotificationRequested.v1` na mesma fila, com um novo `eventId`/`correlationId` (é uma nova tentativa lógica) mas o mesmo `alertEventId`/`channel`/`templateVersion` — o `deliveryKey` computado é o mesmo de antes (`computeDeliveryKey` depende só desses três + a versão do canal), então a idempotência do `EmailSender` cobre a hipótese de o envio original já ter saído.

### `NotificationDelivery.templateVersion` (campo novo)

Hoje o template usado não fica persistido na entrega — só existe no payload efêmero do job. Sem isso, a reconciliação não sabe qual versão de template usar ao republicar. `findOrCreateNotificationDelivery` passa a gravar `templateVersion` na criação.

## 5. Erros

Não há novo erro HTTP — este é um mecanismo interno entre notification-worker e o banco/fila.

## 6. Idempotência e concorrência

- A reconciliação usa `UPDATE ... RETURNING` atômico: duas instâncias do notification-worker rodando a reconciliação ao mesmo tempo nunca reenfileiram a mesma entrega duas vezes, porque só uma delas vê `status = 'SENDING'` no momento do `UPDATE`.
- O reenvio em si passa pelo caminho normal de `processNotificationJob`, que já reivindica atomicamente (`claimNotificationDeliveryForSending`) antes de chamar `emailSender.send()` — a extensão de §4 só amplia quais estados são reivindicáveis, não muda essa garantia.
- Duplicação de mensagem real só seria possível se o `EmailSender` não fosse de fato idempotente — por isso essa idempotência vira parte do contrato da porta, não um detalhe de implementação.

## 7. Observabilidade

- contador `notification_stale_sending_recovered_total` — incrementado por entrega reconciliada;
- log `notification_stale_sending_recovered` com `notificationDeliveryId`, `alertEventId`, `correlationId` novo.

## 8. Critérios de aceitação

- AC-001: entrega presa em `SENDING` além do timeout é encontrada pela reconciliação e vira `RETRYABLE_FAILURE` com `errorCode = STALE_SENDING_LEASE`.
- AC-002: a reconciliação publica um novo job para essa entrega, que é processado normalmente e chega a `DELIVERED`.
- AC-003: se o `EmailSender` já tinha processado aquele `idempotencyKey` (simulando que o envio original de fato saiu), o reenvio não produz uma segunda entrada em `.sent` — só uma mensagem real foi enviada.
- AC-004: entrega em `SENDING` há pouco tempo (dentro do threshold) não é tocada pela reconciliação — ainda pode estar em andamento de verdade.
- AC-005: duas reconciliações concorrentes sobre a mesma entrega presa produzem exatamente um reenfileiramento.

## 9. Testes e evals

- integração (Testcontainers + Redis real) cobrindo AC-001 a AC-005;
- teste unitário do `InMemoryEmailSender` provando a idempotência por `idempotencyKey` (novo comportamento da porta).

## 10. Rollout e rollback

Migração aditiva (`templateVersion Int?` em `notification_deliveries`, nullable — entregas já existentes ficam sem esse dado, aceitável porque só entregas presas em `SENDING` no momento da migração precisariam dele, e essas já são o cenário de bug que esta spec corrige). `STALE_SENDING_THRESHOLD_MS` configurável via env var, sem feature flag.
