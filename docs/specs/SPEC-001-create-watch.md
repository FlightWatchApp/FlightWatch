# SPEC-001 — Criar monitoramento de voo

Status: draft para aprovação  
Versão: 0.1  
Owner: Monitoring  
Dependências: Identity, PostgreSQL, outbox

## 1. Objetivo

Permitir que usuário autenticado crie um Watch com rota, datas e regras de alerta, reutilizando atomicamente um SearchTarget equivalente ou criando um novo.

## 2. Fora do escopo

- datas flexíveis;
- crianças/bebês;
- múltiplas origens/destinos;
- filtros de companhia, conexão ou bagagem;
- consulta síncrona ao provedor;
- emissão ou pagamento.

## 3. Pré-condições

- usuário `active`;
- e-mail/canal selecionado verificado;
- quota de Watches do plano disponível;
- aeroportos, moeda e mercado suportados.

## 4. Entrada

`POST /v1/watches`

```json
{
  "origin": "DOU",
  "destination": "GRU",
  "tripType": "ONE_WAY",
  "departureDate": "2026-12-20",
  "returnDate": null,
  "cabin": "ECONOMY",
  "adults": 1,
  "currency": "BRL",
  "market": "BR",
  "alertRules": [
    {
      "type": "TARGET_PRICE",
      "amountMinor": 80000,
      "cooldownSeconds": 43200
    }
  ],
  "notificationChannelId": "uuid"
}
```

## 5. Validação

- IATA: três letras ASCII, normalizadas para maiúsculas e presentes no catálogo suportado;
- origem diferente do destino;
- ida futura segundo calendário do mercado e dentro da janela do provedor;
- volta obrigatória para `ROUND_TRIP` e posterior à ida;
- volta ausente para `ONE_WAY`;
- `cabin=ECONOMY` e `adults=1` no MVP;
- moeda e mercado pertencem às listas suportadas;
- de 1 a 4 regras, sem duplicata de tipo;
- valores monetários maiores que zero e dentro do limite configurado;
- percentual maior que 0 e menor ou igual a 100;
- cooldown dentro dos limites do produto;
- canal pertence ao usuário, está ativo e verificado;
- campos desconhecidos são rejeitados no contrato público.

## 6. Comportamento

1. Autenticar e autorizar.
2. Aplicar rate limit e quota.
3. Validar e normalizar a entrada.
4. Gerar chave canônica v1 e fingerprint.
5. Em transação:
   - localizar ou criar SearchTarget por fingerprint;
   - confirmar que os campos canônicos coincidem com o registro encontrado;
   - criar Watch `active`, com `expires_at` = meia-noite UTC do dia seguinte à partida (regressão corrigida: o campo existe em DOMAIN.md §3.2 mas nunca era setado, então o Watch nunca saía de `active` mesmo muito depois da viagem — a transição real para `expired` acontece no tick do scheduler, SPEC-002 §5);
   - criar AlertRules versionadas;
   - persistir `WatchCreated` na outbox.
6. Retornar Watch sem aguardar pesquisa externa.

Se colisão teórica do hash for detectada por campos divergentes, a operação falha com erro interno seguro e alerta operacional; não se associa ao target incorreto.

## 7. Resposta de sucesso

Status `201 Created`.

```json
{
  "id": "uuid",
  "status": "ACTIVE",
  "search": {
    "origin": "DOU",
    "destination": "GRU",
    "departureDate": "2026-12-20",
    "returnDate": null,
    "tripType": "ONE_WAY",
    "cabin": "ECONOMY",
    "adults": 1,
    "currency": "BRL"
  },
  "alertRules": [],
  "lastObservation": null,
  "createdAt": "RFC3339"
}
```

O ID e fingerprint internos do SearchTarget não precisam ser expostos ao cliente.

## 8. Erros

| Status | Código                  | Situação                          |
| -----: | ----------------------- | --------------------------------- |
|    400 | `INVALID_WATCH_INPUT`   | combinação ou campo inválido      |
|    401 | `UNAUTHENTICATED`       | sessão ausente/inválida           |
|    403 | `CHANNEL_NOT_VERIFIED`  | canal inválido ou não pertencente |
|    409 | `WATCH_LIMIT_REACHED`   | quota do plano atingida           |
|    422 | `UNSUPPORTED_SEARCH`    | rota/janela/mercado não suportado |
|    429 | `RATE_LIMITED`          | excesso de tentativas             |
|    500 | `WATCH_CREATION_FAILED` | falha interna sem escrita parcial |

Erros não expõem existência de canal de outro usuário nem detalhes do banco.

## 9. Idempotência e concorrência

- Cliente pode enviar `Idempotency-Key` por usuário.
- Repetição da mesma chave e payload retorna o recurso original.
- Mesma chave com payload diferente retorna `409 IDEMPOTENCY_CONFLICT`.
- Constraint única do fingerprint garante SearchTarget único.
- Falha em qualquer etapa da transação não deixa Watch parcial.

## 10. Eventos

`WatchCreated.v1`:

```json
{
  "eventId": "uuid",
  "watchId": "uuid",
  "searchTargetId": "uuid",
  "occurredAt": "RFC3339",
  "correlationId": "opaque-id"
}
```

## 11. Critérios de aceitação

- AC-001: entrada válida cria Watch ativo e regras.
- AC-002: 100 criações equivalentes geram 100 Watches e 1 SearchTarget.
- AC-003: ida e volta inválida não produz escrita parcial.
- AC-004: usuário não usa canal de outro usuário.
- AC-005: repetição idempotente não cria segundo Watch.
- AC-006: resposta não depende de disponibilidade do provedor.
- AC-007: evento de outbox é confirmado na mesma transação.
- AC-008: quota excedida não cria Target órfão.

## 12. Testes e evals

- unitários de validação e canonicalização;
- property tests da chave canônica;
- integração de upsert concorrente e rollback;
- autorização do canal;
- `EVAL-DEDUP-001` a `004`;
- `EVAL-SEC-001`, `002` e `004`;
- `EVAL-PERF-001`.

## 13. Observabilidade

- contador `watch_create_total{result}`;
- histograma de latência;
- contador de target criado versus reutilizado;
- quota rejeitada;
- log com `correlation_id`, `watch_id` e resultado, sem contato pessoal.

## 14. Performance

Meta inicial: p95 abaixo de 500 ms em staging sem chamada externa. O benchmark deve incluir contenção na chave única.

## 15. Rollout e rollback

Feature flag `watch_creation_enabled`. Rollback da aplicação mantém tabelas expansivas. Migração destrutiva não integra esta spec.
