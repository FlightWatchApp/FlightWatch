# SPEC-005 — Avaliar regras e detectar oportunidade de preço

Status: draft para aprovação  
Versão: 0.1  
Owner: Alerting  
Dependências: SPEC-004, DOMAIN.md

## 1. Objetivo

Ao receber uma observação válida, avaliar deterministicamente as regras dos Watches ativos vinculados e criar AlertEvents idempotentes quando as condições forem atendidas.

## 2. Escopo v1

- preço-alvo;
- queda percentual;
- queda absoluta;
- novo menor preço observado;
- cooldown;
- referência por observação anterior ou inicial, conforme regra.

Não inclui previsão, recomendação de compra ou decisão por LLM.

## 3. Entrada

Evento `PriceObserved.v1`. O consumidor busca a observação, target e Watches ativos em páginas; não confia em valores adicionais não persistidos.

## 4. Regras de comparação

### Target price

```text
trigger = current_amount <= target_amount
```

### Absolute drop

```text
drop = reference_amount - current_amount
trigger = drop >= configured_amount
```

### Percentage drop

```text
drop_percent = ((reference_amount - current_amount) / reference_amount) * 100
trigger = drop_percent >= configured_percent
```

### New observed low

```text
trigger = current_amount < minimum_valid_amount_since_watch_activation
```

Comparações exigem moeda idêntica. `reference_amount > 0`. Cálculo usa decimal exato; valor apresentado pode ser arredondado, a decisão não.

## 5. Referência temporal

- somente observações no ou após `watch.starts_at` participam por padrão;
- `previous_valid_observation` ignora falhas e `no_offers`;
- `first_valid_observation` permanece estável;
- observação atual nunca é usada como sua própria referência anterior;
- a consulta deve ser reproduzível usando IDs persistidos.

## 6. Comportamento

Para cada página de Watches:

1. revalidar status e vigência;
2. obter regras habilitadas e versão;
3. resolver a referência;
4. avaliar função pura;
5. registrar resultado/telemetria adequada;
6. se atendida, calcular `deduplication_key`;
7. verificar cooldown e canal;
8. criar AlertEvent e outbox atomicamente;
9. se suprimido, persistir status e motivo sem solicitar entrega.

O fan-out precisa de cursor/checkpoint idempotente para ser retomado sem reiniciar ilimitadamente.

## 7. Cooldown

Cooldown é contado a partir do último AlertEvent efetivamente enfileirado/entregue conforme política definida. V1 usa o último `queued` ou `notified` da mesma regra.

Mesmo durante cooldown, a avaliação pode ser registrada como `suppressed` com motivo `COOLDOWN_ACTIVE`. Não se cria NotificationDelivery.

## 8. Idempotência

```text
deduplication_key =
SHA-256(watch_id|rule_id|price_observation_id|rule_version)
```

Constraint única garante um AlertEvent por avaliação lógica. Redelivery do evento retorna sucesso após confirmar o registro existente.

## 9. Justificativa estruturada

AlertEvent persiste:

- tipo e versão da regra;
- observação atual;
- observação de referência, quando aplicável;
- valores comparados;
- resultado calculado;
- limiar;
- motivo de trigger ou supressão.

Isso alimenta mensagem ao usuário e auditoria sem recalcular com regra futura.

## 10. Critérios de aceitação

- AC-001: preço igual ao alvo dispara.
- AC-002: queda de 20% dispara regra de 15%.
- AC-003: queda de 7% não dispara regra de 15%.
- AC-004: moedas diferentes não são comparadas.
- AC-005: Watch pausado/terminal não gera alerta entregável.
- AC-006: cooldown suprime entrega com evidência.
- AC-007: mesmo evento processado três vezes cria um AlertEvent.
- AC-008: fan-out é paginado e retomável.
- AC-009: explicação usa valores/versão persistidos.
- AC-010: histórico anterior à ativação não dispara por padrão.

## 11. Falhas

- Watch removido/terminal: ignorar com métrica;
- referência inexistente: regra relativa não dispara; preço-alvo ainda pode;
- referência zero/inválida: falha de dados observável, sem divisão;
- página falha: retry do checkpoint;
- banco indisponível: não confirmar consumo;
- regra desconhecida: dead-letter/alerta, sem decisão presumida.

## 12. Evento de saída

`AlertTriggered.v1`/`NotificationRequested.v1` contém IDs, tipo de canal e template versionado, sem destino pessoal no payload de fila quando puder ser resolvido pelo worker.

## 13. Testes e evals

- testes de tabela para limites exatos;
- property tests de monotonicidade e dinheiro;
- estados de Watch e referência temporal;
- concorrência e checkpoint;
- `EVAL-ALERT-001` a `007`;
- `EVAL-IDEMPOTENCY-001`;
- `EVAL-PERF-002`.

## 14. Observabilidade

Nomes concretos (ADR-007, antes só descrito em prosa):

- `alert_rules_evaluated_total{type,result}` — `result` é `triggered`, `not_triggered` ou `no_reference` (regra relativa sem observação de referência ainda — distinto de "avaliou e não disparou", é "não deu pra avaliar de verdade");
- `alert_events_total{outcome}` — `outcome` é `queued`, `suppressed` (cobre "supressões" — motivo já fica no `suppressionReason` persistido, hoje só `COOLDOWN_ACTIVE`) ou `idempotent_replay` (cobre "conflito idempotente esperado": `findOrCreateAlertEvent` achou a linha já existente, redelivery do job ou corrida resolvida);
- `alert_event_lag_seconds` (histograma, sem label) — de `PriceObserved.observedAt` até o `AlertEvent` ser criado;
- `alert_worker_pages_processed_total` (contador, sem label) — "páginas/fan-out e checkpoint": uma página do `selectActiveWatchesPage` por incremento;
- `alert_worker_watch_skipped_total{reason}` — "Watch inválido": `reason=not_active` quando o Watch foi pausado/cancelado entre a leitura da página e a avaliação (SPEC-005 AC-005).

## 15. Performance

Nenhuma consulta por Watch em loop. Carregar Watches/regras e referências em lotes. O plano SQL do fan-out deve integrar o gate de performance.

## 16. Rollout e rollback

Ativar regra por tipo com feature flag. AlertEvents já persistidos não são apagados no rollback. É possível pausar publicação para notificação mantendo avaliação controlada.
