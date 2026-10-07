# DOMAIN — Flight Watch

Versão: 0.1  
Status: proposta para validação

## 1. Linguagem ubíqua

| Termo                | Definição                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| User                 | pessoa autenticada que cria monitoramentos                                                                                       |
| Watch                | intenção individual de monitorar uma viagem                                                                                      |
| AlertRule            | condição individual que pode gerar alerta                                                                                        |
| SearchTarget         | combinação normalizada e deduplicada realmente pesquisada                                                                        |
| SearchExecution      | tentativa de consultar um SearchTarget em um provedor                                                                            |
| FlightOffer          | oferta normalizada retornada por um provedor                                                                                     |
| PriceObservation     | fotografia imutável do melhor resultado elegível observado                                                                       |
| AlertEvent           | registro de que uma regra foi atendida                                                                                           |
| NotificationDelivery | tentativa de entregar um AlertEvent por um canal                                                                                 |
| Provider             | integração externa capaz de pesquisar ofertas                                                                                    |
| ProviderQuota        | estado operacional de cotas e limites do provedor                                                                                |
| OutboxEvent          | evento persistido na mesma transação da mudança de domínio                                                                       |
| FlightSearch         | busca de descoberta pontual, síncrona, sem intenção de monitoramento ainda (SPEC-014)                                            |
| FlightSearchOffer    | oferta normalizada de uma FlightSearch, snapshot igual a FlightOffer mas persistido fora do pipeline de monitoramento (SPEC-014) |
| Deal                 | classificação de oportunidade computada em leitura sobre um SearchTarget, nunca persistida (SPEC-015)                            |

## 2. Limites de contexto

### Identity

Usuários, autenticação, verificação de contato e autorização.

### Monitoring

Watches, regras, SearchTargets, normalização e agendamento.

### Pricing

Execuções de pesquisa, ofertas normalizadas e observações. Desde SPEC-014,
também inclui busca de descoberta pontual (FlightSearch/FlightSearchOffer)
— reaproveita o adaptador de provedor (`packages/providers`), mas não as
tabelas de monitoramento recorrente (SearchTarget/SearchExecution/
PriceObservation), que continuam existindo separadamente para o caso de uso
de observação contínua e compartilhada.

### Alerting

Avaliação determinística, cooldown, idempotência e AlertEvents.

### Notifications

Canais, templates, tentativas, entrega e falhas permanentes.

### Operations

Provedores, cotas, telemetria, auditoria, retenção e reprocessamento.

Os contextos são módulos lógicos no mesmo repositório e banco na fase inicial. Comunicação entre módulos deve ocorrer por serviços públicos ou eventos, não por importação de detalhes internos.

## 3. Entidades e agregados

### 3.1 User

Campos essenciais:

- `id` UUID;
- `email` normalizado e único;
- `status`: `pending_verification`, `active`, `blocked`, `deleted`;
- `timezone`;
- `created_at`, `updated_at`.

Invariantes:

- apenas usuário ativo e com canal verificado pode ativar Watch;
- exclusão deve revogar acesso e iniciar política de anonimização/eliminação;
- um usuário somente acessa recursos dos quais é proprietário.

### 3.2 Watch — aggregate root

Campos essenciais:

- `id`, `user_id`, `search_target_id`;
- `status`: `active`, `paused`, `completed`, `expired`, `cancelled`;
- `starts_at`, `expires_at`;
- `notification_channel_id`;
- dados originais apresentados ao usuário, quando necessários para exibição;
- `created_at`, `updated_at`, `version`.

Transições permitidas:

| Origem    | Destino                               |
| --------- | ------------------------------------- |
| active    | paused, completed, expired, cancelled |
| paused    | active, expired, cancelled            |
| completed | —                                     |
| expired   | —                                     |
| cancelled | —                                     |

Não se reutiliza Watch terminal. Uma nova intenção cria um novo Watch para preservar auditoria.

### 3.3 AlertRule

Tipos iniciais:

- `target_price`: preço observado menor ou igual ao alvo;
- `percentage_drop`: queda percentual mínima sobre a referência;
- `absolute_drop`: queda monetária mínima sobre a referência;
- `new_observed_low`: novo menor preço válido do Watch.

Campos:

- `id`, `watch_id`, `type`;
- parâmetros tipados;
- `reference_strategy`;
- `cooldown_seconds`;
- `enabled`;
- `created_at`, `updated_at`.

Estratégias de referência iniciais:

- `previous_valid_observation`;
- `first_valid_observation`;
- `lowest_valid_observation` quando aplicável.

A interface deve mostrar a referência; não se admite fórmula implícita.

### 3.4 SearchTarget — aggregate root

Campos canônicos:

- `id`, `fingerprint`, `status`;
- `origin_iata`, `destination_iata`;
- `departure_date`, `return_date` opcional;
- `trip_type`, `cabin`, `adults`;
- `currency`, `market`;
- `next_check_at`, `last_checked_at`, `check_interval_seconds`;
- `priority`, `provider_strategy`;
- `created_at`, `updated_at`, `version`.

Chave canônica v1:

```text
schema=v1|origin=DOU|destination=GRU|departure=2026-12-20|
return=-|trip=ONE_WAY|cabin=ECONOMY|adults=1|currency=BRL|market=BR
```

`fingerprint = SHA-256(canonical_key)`.

O hash é índice de busca e unicidade, não substitui os campos canônicos. A versão do esquema faz parte da chave para permitir evolução controlada.

### 3.5 SearchExecution

Registra cada tentativa:

- `id`, `search_target_id`, `provider_id`;
- `status`: `scheduled`, `running`, `succeeded`, `no_offers`, `retryable_failure`, `permanent_failure`, `rate_limited`;
- `attempt`, `idempotency_key`;
- timestamps de agendamento, início e conclusão;
- latência, código de erro sanitizado, contagem de ofertas;
- custo estimado/unidades de cota;
- identificador de correlação.

### 3.6 PriceObservation

Registro imutável:

- `id`, `search_target_id`, `search_execution_id`, `provider_id`;
- `observed_at`;
- `total_amount_minor`, `currency`;
- `base_amount_minor` e `tax_amount_minor` quando disponíveis;
- itinerário normalizado e assinatura da oferta;
- `deeplink` ou referência permitida;
- `expires_at` da oferta, se informado;
- `raw_payload_ref` opcional e sujeito à política de retenção;
- `quality_flags`.

Dinheiro é armazenado em unidade monetária mínima inteira, nunca em ponto flutuante.

Uma resposta sem ofertas gera resultado de execução `no_offers`, não uma observação de preço zero.

### 3.7 AlertEvent

Campos:

- `id`, `watch_id`, `alert_rule_id`, `price_observation_id`;
- `trigger_type`, `reference_amount_minor`, `current_amount_minor`;
- `deduplication_key` única;
- `status`: `pending`, `suppressed`, `queued`, `notified`, `failed`;
- justificativa estruturada;
- timestamps.

Chave idempotente baseline:

```text
SHA-256(watch_id|rule_id|observation_id|rule_version)
```

### 3.8 NotificationDelivery

Campos:

- `id`, `alert_event_id`, `channel`, `destination_ref`;
- `status`: `pending`, `sending`, `delivered`, `retryable_failure`, `permanent_failure`;
- `attempt`, `provider_message_id`, `idempotency_key`;
- erro sanitizado e timestamps.

### 3.9 FlightSearch (SPEC-014)

Busca de descoberta pontual — diferente de SearchTarget, que existe para
observação recorrente e compartilhada entre Watches (ADR-005). Uma
FlightSearch nunca é, por si só, um monitoramento.

Campos essenciais:

- `id`, `user_id` opcional (nulo para busca anônima; hoje sempre nulo — não
  existe autenticação opcional na fronteira HTTP);
- origem, destino (IATA; `ANYWHERE` fora de escopo até existir um catálogo
  de Destination), datas, flexibilidade de data (aceita, ainda inerte),
  passageiros, cabine, moeda, mercado, filtros (`max_stops`,
  `max_price_minor`);
- `status`: `pending`, `running`, `succeeded`, `partial`, `failed`,
  `expired` — nesta fatia (busca síncrona) só `pending → succeeded|failed`
  é alcançável;
- `provider_strategy`, contadores de ofertas retornadas/elegíveis,
  `error_code` sanitizado, `correlation_id`, `created_at`, `expires_at`.

Invariantes:

- falha do provider marca `failed` com `error_code`, nunca é confundida com
  "nenhuma oferta encontrada" (`succeeded` com lista vazia);
- sem chave canônica/fingerprint nesta fatia — cada busca é independente,
  sem deduplicação nem cache.

### 3.10 FlightSearchOffer (SPEC-014)

Snapshot normalizado de uma oferta retornada numa FlightSearch — mesma
forma conceitual de FlightOffer, mas persistido fora do pipeline de
monitoramento, com um `id` opaco e estável que `POST /v1/offers/:id/watch`
usa para derivar um Watch depois.

Campos essenciais:

- `id`, `flight_search_id`;
- `provider_strategy`, `provider_offer_id`;
- `total_amount_minor`, `currency`, `passenger_count`;
- itinerário normalizado (trechos), `offer_signature`;
- `observed_at`, `expires_at`, `deeplink`, `quality_flags`.

Invariantes:

- imutável como snapshot, mesma regra de PriceObservation (DR-004);
- ao derivar um Watch, o preço/itinerário/deeplink usados são exatamente os
  desta oferta — nunca uma nova chamada ao provedor nem uma URL recriada
  depois (mesmo princípio de SPEC-018 para `Watch.currentOffer`).

### 3.11 Deal (SPEC-015)

Classificação de oportunidade sobre a observação mais recente de um
SearchTarget. **Computado em leitura, nunca persistido** — mesmo princípio
de `Watch.currentOffer`/`currentPrice`/`lowestPrice` (`enrichWatch`,
`packages/database/src/watch-listing-repository.ts`): sem tabela própria,
sem invalidação de cache, cada `PriceObservation` nova já "atualiza" a
classificação automaticamente.

Campos essenciais (forma da resposta, não de uma linha de banco):

- `deal_type`: `HISTORICAL_LOW` ou `PERCENTAGE_BELOW_REFERENCE` shipados
  nesta fatia; `FLASH_WINDOW`, `PACKAGE_VALUE` e um `TARGET_PRICE`
  editorial ficam fora de escopo (SPEC-015 §"Fora do escopo" — limiares de
  produto não aprovados, ou dependência de SPEC-017);
- referência usada, `drop_percent` (nulo pra `HISTORICAL_LOW`, que não é
  uma "queda", é "é o menor já visto"), `confidence` (heurística de
  tamanho de amostra), `observation_count`;
- explicação em texto (nunca "promoção" sem justificativa) e janela de
  validade (herdada da observação de origem).

Invariantes:

- nunca persistido (ver acima);
- só existe pra SearchTargets com pelo menos 2 observações
  (`MIN_OBSERVATIONS_FOR_REFERENCE`) — com 1 observação, "média"/"menor já
  visto" seriam a própria observação atual, o que tornaria qualquer preço
  um "deal" trivialmente;
- o feed que expõe `Deal` (`GET /v1/opportunities`) só enxerga
  SearchTargets que já existem porque algum Watch real foi criado — não há
  crawler de fundo descobrindo rotas.

## 4. Regras de domínio

| ID     | Regra                                                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------------------------- |
| DR-001 | Vários Watches podem apontar para o mesmo SearchTarget.                                                                     |
| DR-002 | A combinação canônica de pesquisa possui no máximo um SearchTarget ativo por versão de esquema.                             |
| DR-003 | Criar Watch é transacional: Watch, regras, vínculo e evento de outbox são confirmados juntos.                               |
| DR-004 | PriceObservation é imutável após persistida. Correção cria novo registro ou marca de qualidade, nunca reescrita silenciosa. |
| DR-005 | Falha ou ausência de ofertas não apaga o último preço válido.                                                               |
| DR-006 | Somente observações válidas, na mesma moeda e compatíveis com o alvo podem ser comparadas.                                  |
| DR-007 | Uma regra usa fórmula e referência explicitamente versionadas.                                                              |
| DR-008 | A mesma chave de AlertEvent produz no máximo um evento persistido.                                                          |
| DR-009 | Cooldown suprime entrega, mas preserva evidência auditável da avaliação.                                                    |
| DR-010 | Reprocessamento de jobs não duplica execução lógica, observação, AlertEvent ou entrega.                                     |
| DR-011 | Apenas Watches ativos participam da avaliação.                                                                              |
| DR-012 | SearchTarget sem Watch ativo não deve continuar sendo agendado, salvo janela técnica de reconciliação.                      |
| DR-013 | Preço deve incluir o total conhecido para todos os passageiros representados na consulta.                                   |
| DR-014 | Um valor de outra moeda não é convertido silenciosamente para disparar regra; conversão futura exige fonte e timestamp.     |
| DR-015 | Nenhuma mensagem é enviada sem canal verificado e consentimento aplicável.                                                  |
| DR-016 | Estado terminal de Watch não pode retornar a ativo.                                                                         |
| DR-017 | O provedor externo nunca é acessado pela camada de domínio.                                                                 |
| DR-018 | Eventos externos e logs não podem expor segredos ou dados pessoais desnecessários.                                          |
| DR-019 | Deal nunca é persistido; é recalculado a cada leitura a partir de PriceObservation existentes.                              |

## 5. Fórmulas

### Queda absoluta

```text
absolute_drop = reference_amount - current_amount
trigger = absolute_drop >= configured_amount
```

### Queda percentual

```text
percentage_drop = ((reference_amount - current_amount) / reference_amount) * 100
trigger = percentage_drop >= configured_percentage
```

Regras:

- `reference_amount` deve ser maior que zero;
- cálculos usam decimal de precisão definida, com arredondamento apenas na apresentação;
- aumento de preço resulta em queda negativa e não aciona a regra;
- comparações monetárias exigem mesma moeda.

## 6. Política de seleção da observação

Para cada execução bem-sucedida, o adaptador retorna ofertas normalizadas. Um serviço determinístico filtra ofertas incompatíveis e seleciona o menor `total_amount_minor` elegível. Empates devem usar critérios estáveis, por exemplo: menor duração total, menos conexões e identificador normalizado.

A estratégia exata deve ser versionada (`offer_selection_policy_version`) para que um alerta seja reproduzível.

## 7. Concorrência e consistência

- unicidade do `fingerprint` é garantida no banco;
- criação concorrente usa upsert/controle de conflito;
- scheduler utiliza lease ou lock com expiração e reconciliação;
- workers são at-least-once; efeitos devem ser idempotentes;
- outbox garante publicação eventual após commit;
- não se exige transação distribuída com provedores externos;
- `version` permite concorrência otimista em agregados mutáveis.

## 8. Eventos de domínio iniciais

- `WatchCreated`
- `WatchActivated`
- `WatchPaused`
- `WatchTerminated`
- `SearchTargetBecameEligible`
- `PriceCheckRequested`
- `PriceObserved`
- `PriceCheckFailed`
- `AlertTriggered`
- `AlertSuppressed`
- `NotificationRequested`
- `NotificationDelivered`
- `NotificationFailed`

Eventos carregam IDs e metadados mínimos; consumidores buscam dados autorizados quando necessário.

## 9. Retenção e privacidade

- dados pessoais ficam separados, quando viável, de telemetria operacional;
- destinos de notificação devem ser referenciados, não repetidos em logs;
- payload bruto do provedor possui retenção curta e acesso restrito;
- observações normalizadas podem ter retenção maior para histórico e evals;
- fixtures de eval não contêm dados pessoais nem credenciais;
- prazos finais dependem de política LGPD e contratos do provedor.

## 10. Fora do domínio inicial

Reservas, emissão, pagamento, reembolso, pontos/milhas, previsão de preço e recomendação por IA não pertencem ao domínio v0.1.

Catálogo real de `Destination` (geodados licenciados e versionados —
cidades, aeroportos, países, aliases, timezone, relações de hub) também
segue fora do domínio v0.1. SPEC-016 usa uma tabela fixa provisória com
coordenadas dos 7 aeroportos já suportados
(`apps/web/src/lib/domain/airport-coordinates.ts`) só para plotar
marcadores no mapa — não é um substituto para um catálogo real, e as três
cópias da mesma lista fixa de aeroportos (ali, em
`apps/api/src/watches/supported-catalog.ts` e no formulário de criação de
Watch) deveriam colapsar numa fonte só quando essa decisão for tomada.
