# SPEC-006 — Enviar notificação de alerta

Status: draft para aprovação  
Versão: 0.1  
Owner: Notifications  
Dependências: SPEC-005, canal de e-mail baseline

## 1. Objetivo

Entregar ao usuário uma mensagem clara e idempotente para um AlertEvent válido, registrar todas as tentativas e classificar falhas sem duplicação ou retry infinito.

## 2. Canal inicial

E-mail é a baseline técnica por menor barreira operacional. WhatsApp, push ou SMS exigem ADR/spec própria, opt-in, template e custos específicos. A escolha comercial final permanece pendente.

## 3. Pré-condições

- AlertEvent `queued` e não suprimido;
- Watch e usuário não bloqueados/cancelados conforme política;
- canal pertence ao usuário, está ativo, verificado e consentido;
- template versionado disponível;
- destino resolvido de armazenamento autorizado.

## 4. Conteúdo mínimo

- origem, destino e datas;
- preço atual e moeda;
- regra acionada em linguagem clara;
- referência usada, quando aplicável;
- instante da observação e idade do dado;
- aviso de variação/disponibilidade;
- link permitido e validado, quando disponível;
- link de preferências/cancelamento apropriado.

Não usar “menor preço do mercado”. Para essa regra, usar “novo menor preço observado desde o início deste monitoramento”.

## 5. Idempotência

```text
delivery_key = SHA-256(alert_event_id|channel|destination_version|template_version)
```

Há constraint única. Quando o provedor de mensagens aceitar idempotency key, a mesma chave é enviada. Timeout ambíguo deve consultar status, quando possível, antes de reenviar.

## 6. Comportamento

1. Consumir `NotificationRequested.v1` e validar schema.
2. Obter AlertEvent e verificar estado.
3. Resolver canal/destino atual autorizado.
4. Criar ou recuperar NotificationDelivery por chave.
5. Renderizar template com dados persistidos no evento.
6. Validar links e tamanho.
7. Marcar tentativa `sending` e chamar provider com timeout.
8. Persistir `delivered`, `retryable_failure` ou `permanent_failure`.
9. Atualizar AlertEvent para `notified` quando política de entrega for satisfeita.
10. Emitir evento de resultado via outbox.

## 7. Falhas e retry

| Classe                                | Tratamento                                       |
| ------------------------------------- | ------------------------------------------------ |
| timeout/5xx/rate limit                | retry limitado com backoff e jitter              |
| endereço temporariamente indisponível | retry conforme provider                          |
| destino inválido/bounce permanente    | falha permanente e possível desativação do canal |
| template ausente/inválido             | falha operacional, sem envio parcial             |
| canal não verificado/revogado         | suprimir/cancelar entrega com motivo             |
| evento inexistente/incompatível       | DLQ e alerta operacional                         |

Após o máximo de tentativas, a entrega vai para estado terminal e revisão/replay controlado. Replay conserva a chave idempotente quando representa a mesma entrega.

## 8. Templates

- versionados e revisados;
- variáveis com escaping por contexto;
- sem HTML arbitrário vindo do provedor de voo;
- preview e snapshot tests;
- locale/timezone explícitos;
- valores monetários formatados a partir de inteiro + moeda;
- texto alternativo/plano para e-mail.

## 9. Privacidade e segurança

- endereço completo não aparece em logs ou métricas;
- tokens de unsubscribe são opacos, expirados/rotacionáveis e não contêm PII;
- links externos passam por allowlist/validação;
- pixels/rastreamento respeitam política de privacidade;
- credenciais do canal ficam em secret manager;
- conteúdo não inclui informação de outro Watch/usuário.

## 10. Critérios de aceitação

- AC-001: alerta válido gera uma mensagem com regra explicada.
- AC-002: redelivery do job não gera segunda mensagem lógica.
- AC-003: timeout temporário recupera sem duplicação dentro das capacidades do canal.
- AC-004: falha permanente não entra em retry infinito.
- AC-005: canal revogado não recebe mensagem.
- AC-006: preço e timezone são formatados corretamente.
- AC-007: logs e métricas não expõem destino completo.
- AC-008: template não afirma menor preço global.
- AC-009: estado e tentativas permanecem auditáveis.

## 11. Testes e evals

- renderização/snapshots dos templates;
- escaping de conteúdo e validação de links;
- integração com provider fake para sucesso, 429, 5xx, timeout e bounce;
- concorrência na delivery key;
- `EVAL-IDEMPOTENCY-001`;
- `EVAL-NOTIFY-001` a `004`;
- `EVAL-SEC-003`.

## 12. Observabilidade

Nomes concretos (ADR-007, antes só descrito em prosa):

- `notification_deliveries_total{channel,status,templateVersion}` — entregas por canal/status (`status`: `delivered`/`retryable_failure`/`permanent_failure`; cobre "bounce/falha permanente" via `permanent_failure`); `templateVersion` é baixa cardinalidade (inteiro que muda raramente) e útil pra acompanhar adoção de um template novo;
- `notification_delivery_lag_seconds{channel}` (histograma) — de `AlertEvent.createdAt` até a entrega ser resolvida (cobre "AlertEvent → fila → provider": é o tempo fim-a-fim desde que o evento existiu até o resultado, não só a chamada ao provider);
- `notification_delivery_attempts_total{channel}` (contador) — uma tentativa de envio reivindicada (cobre "tentativas e retry");
- `notification_duplicate_deliveries_prevented_total` (contador, sem label) — `claimNotificationDeliveryForSending` recusou reivindicar (já `SENDING`/`DELIVERED`/`PERMANENT_FAILURE`) — "duplicatas impedidas".

**Fora do escopo desta fase**: DLQ e idade da entrega — não há fila de dead-letter própria da aplicação; o BullMQ já mantém sua lista interna de jobs falhos (`worker.on('failed', ...)`, hoje só logada), que pode ser raspada separadamente se isso virar prioridade.

Métricas não usam e-mail ou user ID como label.

## 13. Performance

Workers possuem concorrência e rate limit separados por canal. Templates são compilados/cacheados de forma reconstruível. Envio nunca ocorre no request HTTP do usuário.

## 14. Rollout e rollback

Primeiro enviar somente para contas internas allowlisted. Em seguida, canário. Kill switch por canal interrompe novos envios sem apagar AlertEvents. Rollback de template fixa versão nova; mensagens já enviadas não são mutadas.
