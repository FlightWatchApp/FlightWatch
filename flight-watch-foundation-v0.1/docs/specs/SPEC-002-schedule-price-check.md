# SPEC-002 — Agendar verificação de preço

Status: draft para aprovação  
Versão: 0.1  
Owner: Monitoring/Operations  
Dependências: SPEC-001, BullMQ, Redis, outbox

## 1. Objetivo

Identificar SearchTargets elegíveis e enfileirar verificações dentro de orçamento, cota e prioridade, sem gerar tempestade de jobs ou duplicação lógica.

## 2. Elegibilidade

Um SearchTarget é elegível quando:

- está ativo;
- possui ao menos um Watch ativo;
- `next_check_at <= now`;
- data de partida ainda permite monitoramento;
- não existe lease válida ou execução lógica já agendada (inclui SCHEDULED, RUNNING **e também** RETRYABLE_FAILURE/RATE_LIMITED — regressão corrigida: excluir só SCHEDULED/RUNNING deixava o scheduler recriar uma execução nova pro mesmo target enquanto o retry do BullMQ pra aquele job ainda estava pendente, já que `next_check_at` não avança em falha; só um status terminal — SUCCEEDED/NO_OFFERS/PERMANENT_FAILURE — libera o target de novo);
- provedor/estratégia está habilitado;
- orçamento operacional permite a consulta.

## 3. Entrada e saída

Entrada: tick periódico ou comando de reconciliação.  
Saída: jobs `PriceCheckRequested.v1` e atualização transacional do estado de agendamento.

```json
{
  "schemaVersion": 1,
  "jobId": "uuid",
  "idempotencyKey": "sha256",
  "correlationId": "opaque-id",
  "searchTargetId": "uuid",
  "scheduleWindow": "RFC3339/RFC3339",
  "requestedAt": "RFC3339"
}
```

## 4. Priorização

Score baseline, configurável:

- proximidade da partida;
- prioridade do plano;
- quantidade de Watches ativos;
- idade da última observação válida;
- atraso acumulado;
- saúde/custo do provedor.

O score nunca ignora indefinidamente targets de baixa prioridade. Deve existir aging ou cota mínima por classe.

Intervalos finais são parâmetros operacionais derivados de evals; não ficam hardcoded no domínio.

## 5. Comportamento

1. Selecionar lote limitado usando índice de `next_check_at`.
2. Bloquear linhas/obter lease sem bloquear todo o scheduler.
3. Revalidar elegibilidade.
4. Calcular janela e chave idempotente por target + janela + estratégia.
5. Criar SearchExecution `scheduled` e evento de outbox.
6. Atualizar estado necessário para impedir novo agendamento imediato.
7. Publisher envia job à fila.
8. Reconciliador recupera leases/eventos abandonados: (a) SCHEDULED/RUNNING travados além do timeout viram RETRYABLE_FAILURE; (b) RETRYABLE_FAILURE/RATE_LIMITED cuja janela de retry do BullMQ (5 tentativas, backoff exponencial) já deveria ter esgotado viram PERMANENT_FAILURE, liberando o target; (c) Watches com `expires_at` vencido transicionam para `expired` (DOMAIN.md §3.2) — nenhuma das três é uma "reconciliação de lease" no sentido estrito, mas rodam no mesmo tick pelo mesmo motivo: sem elas, um estado transitório não-terminal trava o target/Watch indefinidamente sem sinal visível do motivo.

## 6. Concorrência

- múltiplas réplicas podem executar simultaneamente;
- seleção usa `FOR UPDATE SKIP LOCKED` ou mecanismo equivalente;
- chave idempotente possui constraint persistente;
- lease contém expiração e owner opaco;
- relógio da aplicação não é usado para ordenar eventos sem considerar a fonte de tempo definida.

## 7. Backpressure e orçamento

O scheduler deve reduzir/agiar trabalho quando:

- fila ultrapassa idade/tamanho limite;
- rate limit disponível está baixo;
- circuit breaker está aberto;
- orçamento diário/mensal foi atingido;
- banco ou provedor apresenta degradação.

A postergação atualiza motivo e próxima tentativa. Não deve marcar consulta como concluída.

## 8. Falhas

| Falha                      | Tratamento                                            |
| -------------------------- | ----------------------------------------------------- |
| Redis indisponível         | outbox permanece pendente; não perde intenção         |
| banco indisponível         | tick falha e alerta; nenhuma suposição de agendamento |
| publisher falha após envio | republicação; consumidor idempotente                  |
| lease expira               | reconciliar e permitir nova tentativa segura          |
| target fica sem Watches    | cancelar/ignorar antes da chamada externa             |
| orçamento esgotado         | postergar com métrica e motivo                        |

## 9. Critérios de aceitação

- AC-001: target elegível cria no máximo uma execução por janela.
- AC-002: duas réplicas não geram duas consultas lógicas.
- AC-003: target sem Watch ativo não é consultado.
- AC-004: perda do Redis não perde intenção persistida.
- AC-005: backlog aciona backpressure configurado.
- AC-006: targets atrasados ganham prioridade de forma limitada.
- AC-007: orçamento impede excedente e gera evidência operacional.
- AC-008: job contém somente identificadores e metadados mínimos.

## 10. Testes e evals

- seleção e ordenação por score;
- concorrência entre schedulers;
- lease expirada;
- outbox republicada;
- `EVAL-IDEMPOTENCY-003`;
- `EVAL-QUEUE-001`;
- `EVAL-PERF-003`;
- `EVAL-COST-001` e `002`.

## 11. Observabilidade

- `scheduler_targets_scanned_total` — targets selecionados por tick (não é "toda linha fisicamente examinada" no índice, é o resultado já filtrado por `selectEligibleSearchTargetsForUpdate`; nome mantido por compatibilidade, considerar renomear numa versão futura se a ambiguidade incomodar consumidores externos);
- `scheduler_jobs_created_total{result,reason}`;
- `scheduler_tick_errors_total{reason}` — falhas do tick em si (ex.: erro de transação), separado de `jobs_created` pra não confundir "nenhum job criado" com "tick quebrou";
- `scheduler_reconciliations_total{reason}` — `reason` é `abandoned_lease`/`retry_exhausted`/`watch_expired`: é a métrica de "leases expiradas e reconciliadas";
- `scheduler_targets_delayed{priority}` (gauge) — targets atrasados por classe; `priority` normalizado pra um conjunto fechado (`STANDARD`/`HIGH`/`LOW`/`OTHER`) antes de virar label, já que a coluna no banco é texto livre sem enum (evita cardinalidade não controlada vinda de um valor inesperado).

**Fora do escopo desta fase**: idade p95/p99 do atraso (precisa de um histograma calibrado com dado real de produção, que ainda não existe) e orçamento restante/postergações (não há orçamento operacional implementado ainda — ver §7, placeholder).

## 12. Performance

Seleção sempre paginada. Nenhum tick carrega todos os targets. Tamanho do lote, frequência e concorrência são configuração validada.

## 13. Segurança

Scheduler não recebe entrada pública. Ações administrativas de replay/reconciliação exigem autorização forte e auditoria.

## 14. Rollout e rollback

Ativar inicialmente com provedor simulado e classe interna. Kill switch global e por provedor interrompe novos jobs, preservando gestão de Watches e dados existentes.
