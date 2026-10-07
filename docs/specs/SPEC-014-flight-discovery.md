# SPEC-014 — Descoberta e busca de passagens

Status: draft para aprovação
Owner: Monitoring
Dependências: SPEC-001, SPEC-003, SPEC-004, SPEC-007, SPEC-008, SPEC-009, SPEC-018,
`docs/roadmap/rascunhos/SPEC-014-flight-discovery.md`,
`docs/roadmap/04-domain-and-platform-evolution.md`

## Objetivo

Permitir que uma pessoa pesquise opções de passagem e veja ofertas reais
**sem precisar criar um Watch antes** — hoje só é possível monitorar uma
rota criando o monitoramento diretamente, sem nunca ver o preço primeiro.
Esse é o gap central identificado na análise de referência do
FlightConnections (`docs/roadmap/01-reference-analysis-flightconnections.md`)
que motivou a "Fase 1" do roadmap.

Esta é a primeira fatia de SPEC-014 a ser implementada: busca **síncrona**,
usando exclusivamente o `SimulatedFlightProvider`, com um destino IATA
concreto (não `ANYWHERE`). O rascunho original (`docs/roadmap/rascunhos/SPEC-014-flight-discovery.md`)
desenha uma entrega maior — busca assíncrona com polling, `ANYWHERE`,
`Deal`/`PackageOffer`/`Destination`. Ver "Fora do escopo" para o raciocínio
completo do corte.

## Fora do escopo

- **destino `ANYWHERE`**: depende de um catálogo de `Destination` (geodados
  licenciados e versionados) que ainda não existe —
  `docs/roadmap/05-roadmap.md` já registra "não começar pelo
  mapa". `destination` continua exigindo um IATA de 3 letras da mesma
  allowlist de `apps/api/src/watches/supported-catalog.ts`; enviar
  `"ANYWHERE"` cai no mesmo erro de formato de qualquer IATA inválido, sem
  mensagem especial;
- **busca assíncrona/polling**: a recomendação do rascunho original por
  busca assíncrona é justificada por um provider real _lento_ — o único
  provider disponível (`SimulatedFlightProvider`) é síncrono e in-process
  (sem rede). Provider real está `BLOQUEADO` (CLAUDE.md §1.3, contrato
  Duffel pendente). Construir fila/job/polling agora seria complexidade
  especulativa para uma latência que não existe hoje. `FlightSearchStatus`
  continua modelando `PENDING/RUNNING/PARTIAL/EXPIRED` para não fechar essa
  porta, mas nesta fatia só `PENDING → SUCCEEDED|FAILED` é alcançável —
  nenhum código produz `RUNNING`, `PARTIAL` ou `EXPIRED`;
- `Deal` (classificação de oportunidade), `PackageOffer` (pacotes) e
  `Destination` (catálogo de destinos): SPEC-015, SPEC-017 e SPEC-016
  respectivamente, todas dependentes desta;
- `dateFlexibilityDays`: aceito e validado no contrato de entrada, mas
  funcionalmente inerte — não existe consulta multi-data ao provider ainda;
- cache/deduplicação entre buscas equivalentes (`FlightSearch` não tem
  fingerprint/chave canônica nesta fatia — sem fila, não há o que
  deduplicar);
- métrica de clique em oferta pré-Watch (`flight_offer_click_total`): o
  clique que importa para o produto já é coberto por SPEC-018
  (`watch_purchase_link_click_total`) a partir do momento em que a oferta
  vira Watch; um evento de clique adicional só na tela de resultados de
  busca (antes de qualquer intenção de monitorar) foi cortado por trazer
  valor marginal nesta fatia;
- os demais endpoints do documento de domínio (`GET /v1/opportunities`,
  `GET /v1/destinations/:id`, `GET /v1/packages`, `POST /v1/searches/:id/save`,
  `GET /v1/me/recommendations`): pertencem a specs futuras;
- emissão, reserva, pagamento ou qualquer confirmação de compra — o Flight
  Watch nunca deixa de ser um observador que aponta para o canal externo
  autorizado (mesmo princípio de SPEC-018).

## Atores e autorização

- **busca** (`POST /v1/searches/flights`, `GET /v1/searches/flights/:id`):
  pública, sem autenticação. `FlightSearch.userId` fica sempre `null` nesta
  fatia — não existe guard de autenticação opcional no código (`SessionAuthGuard`
  é tudo ou nada); construir um guard novo só para popular um campo que
  nada lê ainda não se justifica;
- **derivar Watch de uma oferta** (`POST /v1/offers/:id/watch`): autenticado,
  `SessionAuthGuard` (mesmo guard de SPEC-001/008/009/018). Não há checagem
  de "dono da busca" — uma `FlightSearchOffer` não pertence a ninguém (a
  busca de origem pode até ter sido anônima); qualquer usuário autenticado
  que tenha o `id` opaco da oferta pode derivá-la em um Watch seu.

## Entradas e validação

### `POST /v1/searches/flights`

```json
{
  "origin": "GRU",
  "destination": "DOU",
  "tripType": "ONE_WAY",
  "departureDate": "2026-12-20",
  "returnDate": null,
  "dateFlexibilityDays": 0,
  "cabin": "ECONOMY",
  "adults": 1,
  "currency": "BRL",
  "market": "BR",
  "maxStops": 1,
  "maxPriceMinor": null
}
```

Validação Zod (`packages/contracts/src/searches/create-flight-search.ts`,
`createFlightSearchRequestSchema`):

- `origin`/`destination`: IATA de 3 letras (`iataCodeSchema`, compartilhado
  com `createWatchRequestSchema` via `packages/contracts/src/shared/trip-fields.ts`);
- invariantes de viagem (origem ≠ destino, `ONE_WAY`/`ROUND_TRIP` ↔
  `returnDate`, `departureDate` no futuro): `applyTripInvariants`
  (`packages/contracts/src/shared/trip-validation.ts`) — **extraída de
  `createWatchRequestSchema` nesta spec**, porque "derivar Watch de uma
  oferta" monta o `CreateWatchRequest` diretamente no código (não passa
  pelo pipe de validação de Watch de novo); sem um único ponto de verdade,
  uma busca poderia aceitar uma combinação que a criação de Watch
  rejeitaria;
- `maxStops`: inteiro 0-3, aplicado como filtro real pós-busca (não é só
  validado, é usado);
- `maxPriceMinor`: inteiro positivo, também aplicado como filtro real;
- rejeita campos desconhecidos (`.strict()`).

Falha de validação → `400 INVALID_SEARCH_INPUT`.

Depois da validação de schema, `isSupportedSearch` (reusado de
`apps/api/src/watches/supported-catalog.ts`, mesma allowlist de SPEC-001)
checa origem/destino/moeda/mercado → `422 UNSUPPORTED_SEARCH` se fora do
catálogo placeholder.

### `POST /v1/offers/:id/watch`

```json
{
  "alertRules": [{ "type": "TARGET_PRICE", "amountMinor": 80000, "cooldownSeconds": 43200 }],
  "notificationChannelId": "..."
}
```

Só o que a `FlightSearch` de origem não já capturou — o resto do
`CreateWatchRequest` (origem, destino, datas, moeda, mercado) é montado no
código a partir da busca persistida. `alertRules`/`notificationChannelId`
reusam exatamente os schemas de SPEC-001 (`alertRuleInputSchema`,
`assertUniqueAlertRuleTypes`).

## Comportamento de domínio e invariantes

### O provider já devolve todas as ofertas, não só a vencedora

`FlightProvider.search()` (`packages/providers/src/port.ts`) sempre
devolveu `ProviderSearchResult.offers: FlightOffer[]` — plural. A redução a
"uma vencedora" (`selectBestOffer`, `packages/domain/src/pricing/flight-offer.ts`)
só acontece no pipeline de **monitoramento** (`apps/price-worker`), nunca na
porta em si. A busca de descoberta chama o mesmo `SimulatedFlightProvider`
diretamente e valida cada oferta com `isOfferEligible`, sem reduzir a uma
única — SPEC-014 não precisou de nenhuma mudança na porta do provider.

### Fluxo de `searchFlights`

1. `isSupportedSearch` → `422` se não suportado.
2. `createPendingFlightSearch` — insere `FlightSearch` com `status: PENDING`.
3. `provider.search(query, { correlationId, searchExecutionId: flightSearch.id })`
   **fora de qualquer transação do Postgres** — mesma regra que
   `apps/price-worker/src/process-job.ts` já segue (nunca segurar uma
   transação durante I/O externo). `ProviderContext.searchExecutionId` é
   reaproveitado com o `FlightSearch.id`: não existe `SearchExecution` no
   caminho de descoberta, e a porta não precisava de um segundo campo
   equivalente só para este chamador.
4. **Erro do provider (`ProviderError`)**: `completeFlightSearch(status:
FAILED, errorCode: error.errorClass)`. A resposta HTTP continua `201`
   (não 5xx) — o recurso `FlightSearch` foi criado de verdade e é
   endereçável via `GET .../:id`; devolver 5xx faria o cliente tratar "o
   provider falhou agora" como "a requisição em si é inválida", quando na
   verdade é um estado de negócio legítimo e transitório. Ver "Questões em
   aberto" para o contraponto.
5. **Sucesso**: cada oferta passa por `isOfferEligible` (mesma função pura
   de SPEC-003/004), depois por `maxStops`/`maxPriceMinor` se informados.
   As sobreviventes são persistidas via `completeFlightSearch(status:
SUCCEEDED, offers: [...])` numa única transação (`createMany` + update
   do status/contadores).
6. Zero ofertas elegíveis (provider devolveu `no_offers`, ou todas foram
   filtradas) → `SUCCEEDED` com `offers: []` — nunca confundido com falha
   (AC do rascunho original: "falha do provider não aparece como 'nenhuma
   passagem existe'"; aqui o contraponto simétrico também vale: um filtro
   legítimo do usuário não aparece como falha).

### `purchaseUrl`/`availabilityStatus` reusam SPEC-018 tal qual

Cada oferta (na busca e na leitura por `id`) tem `purchaseUrl` calculado via
`resolvePurchaseUrl(deeplink, providerStrategy)` (allowlist de host/esquema)
e `availabilityStatus` via `resolveCurrentOfferStatus(expiresAt)` — as
mesmas funções que já projetam `Watch.currentOffer`. Recalculados a cada
leitura (nunca cacheados/persistidos), mesma disciplina de `enrichWatch`.

### Derivar Watch de uma oferta reusa `WatchesService.createWatch()` tal qual

`POST /v1/offers/:id/watch` **não reimplementa** fingerprint, deduplicação
de `SearchTarget`, checagem de quota nem idempotência de criação — monta um
`CreateWatchRequest` a partir da `FlightSearch` persistida e chama
`WatchesService.createWatch()` (SPEC-001), o mesmo método que
`POST /v1/watches` já usa. Pré-requisito: `WatchesModule` passou a exportar
`WatchesService` (antes só a usava internamente).

Antes de derivar, se `resolveCurrentOfferStatus(offer.expiresAt) === 'EXPIRED'`,
a requisição é rejeitada com `410 OFFER_EXPIRED` — **decisão deliberada,
diferente do comportamento do SPEC-018** (que mantém `currentOffer` de um
Watch _existente_ mesmo expirado, só muda o rótulo). Aqui é a criação
_inicial_ de um Watch a partir de um preço que já se sabe estar morto — não
faz sentido nascer stale. Ver "Questões em aberto".

### Watch derivado expõe `currentOffer` imediatamente, sem esperar o scheduler

Depois de `createWatch()` retornar, `seedInitialObservation` popula o
`currentOffer` do Watch recém-criado **a partir do snapshot da oferta que o
usuário já viu** — sem uma segunda chamada ao provider (a oferta persistida
já tem tudo: preço, itinerário, `deeplink`, `expiresAt`). Reusa
`claimSearchExecutionForRunning` + `persistPriceObservationSuccess`
(`packages/database/src/price-observation-repository.ts`) exatamente como
estão — **nenhuma função nova de repositório foi criada para "observação
instantânea"**:

```
tx.searchExecution.create({ status: 'SCHEDULED', idempotencyKey: `discovery-seed:${watchId}`, ... })
claimSearchExecutionForRunning(tx, execution.id)   // -> RUNNING, lease novo
persistPriceObservationSuccess(tx, { ...snapshot da oferta..., leaseToken })
```

`discovery-seed:${watchId}` é o que torna essa função idempotente: chamar
depois de todo `createWatch()` — inclusive num replay de `Idempotency-Key`,
que o retorno de `createWatch()` não distingue de uma criação nova — precisa
ser seguro. No replay, `tx.searchExecution.create` colide na constraint
única de `idempotencyKey`, capturado via `isUniqueConstraintViolation(error,
'idempotencyKey')` e tratado como no-op silencioso.

**Corrida benigna, deliberadamente não corrigida**: `findOrCreateSearchTarget`
(chamado dentro de `createWatch()`) inicializa `SearchTarget.nextCheckAt =
now()` — imediatamente elegível. Entre o commit de `createWatch()` e o
commit de `seedInitialObservation`, o scheduler poderia em teoria pegar o
mesmo target. Isso não corrompe nada: `persistPriceObservationSuccess`
dedupe por `observationKey`, e cada caminho tem sua própria
`SearchExecution`/lease — na pior hipótese existem duas observações, e
`ORDER BY observedAt DESC` (`enrichWatch`, SPEC-009) já escolhe a mais nova
corretamente.

**Efeito colateral observado, não um bug**: `Watch.startsAt` é definido em
`now()` no momento da criação (SPEC-001), enquanto `offer.observedAt` é o
instante da busca original — sempre um pouco _antes_ do Watch existir,
mesmo com zero atraso entre buscar e clicar "Monitorar". Como
`lowestPrice`/`priceHistory` filtram por `observedAt >= watch.startsAt`
(SPEC-009 §6, propositalmente diferente de `currentOffer`/`currentPrice`,
que nunca tiveram esse corte — ver comentário em
`packages/database/src/watch-listing-repository.ts`), a observação semeada
**nunca** conta para `lowestPrice` do Watch recém-criado, embora sempre
apareça em `currentPrice`/`currentOffer`. Confirmado em smoke test ao vivo:
`currentPrice`/`currentOffer` corretos, `lowestPrice: null` até a próxima
observação real do scheduler. Este é o mesmo comportamento, já documentado
e aceito, de SPEC-009/018 — não uma regressão introduzida aqui.

## Contrato de API/evento/job

- `POST /v1/searches/flights` — público, `201`, corpo: ver "Entradas e
  validação". Resposta: `FlightSearchResponse` (id, status, query ecoada,
  `errorCode`, `createdAt`, `expiresAt`, `offers[]`).
- `GET /v1/searches/flights/:id` — público, `200` ou `404
FLIGHT_SEARCH_NOT_FOUND`. Mesma forma de resposta.
- `POST /v1/offers/:id/watch` — autenticado, `201`, resposta idêntica a
  `POST /v1/watches` (`CreateWatchResponse`, SPEC-001) — nenhum tipo de
  resposta novo.

Nenhum job/fila novo — busca síncrona, sem publicação de evento.

## Persistência e migrações

Migração `20260921213059_flight_discovery` (hand-crafted, `prisma migrate
diff` → `migration.sql` → `prisma migrate deploy`, mesmo processo de todas
as migrações anteriores deste projeto):

- `FlightSearch` (`flight_searches`): id, `userId?` (FK `User`, sempre null
  nesta fatia), origem/destino/datas/tripo/cabine/passageiros/moeda/mercado,
  `maxStops?`, `maxPriceMinor?`, `status` (`FlightSearchStatus`),
  `providerStrategy`, `offersReturnedCount`, `offersEligibleCount`,
  `errorCode?`, `correlationId`, `createdAt`, `expiresAt?`. Índice
  `[userId, createdAt]`.
- `FlightSearchOffer` (`flight_search_offers`): id, `flightSearchId` (FK),
  `providerStrategy`, `providerOfferId`, `totalAmountMinor`, `currency`,
  `passengerCount`, `itinerary` (Json, mesma escolha de
  `PriceObservation.itinerary`), `offerSignature`, `observedAt`,
  `expiresAt?`, `deeplink?`, `qualityFlags`, `createdAt`. Índice
  `[flightSearchId]`.

Deliberadamente sem `fingerprint`/chave canônica em `FlightSearch` (sem
fila, não há o que deduplicar nesta fatia) e sem
`FlightSearchOffer.derivedWatchId` (nenhum critério de aceitação pede
rastreabilidade reversa).

## Idempotência e concorrência

- `POST /v1/searches/flights`: sem idempotência própria — cada chamada cria
  uma `FlightSearch` nova. Não há `Idempotency-Key` no contrato (mesma
  decisão do rascunho: buscar de novo é uma ação legítima, não um efeito
  que precise ser exatamente-uma-vez);
- `POST /v1/offers/:id/watch`: idempotência via `Idempotency-Key` reusa 100%
  o mecanismo de SPEC-001 (`WatchesService.createWatch`), sem alteração;
- `seedInitialObservation`: idempotente via `discovery-seed:${watchId}`
  (ver "Comportamento de domínio").

## Modos de falha e retries

- erro do provider (`ProviderError`) durante a busca: `FlightSearch`
  marcada `FAILED` com `errorCode` sanitizado (`error.errorClass` —
  `RATE_LIMITED`/`TIMEOUT`/`UNAVAILABLE`/etc., nunca a mensagem bruta do
  provider); sem retry automático nesta fatia (síncrona — o usuário decide
  se busca de novo);
- `FlightSearchOffer` expirada em `POST /v1/offers/:id/watch`: `410
OFFER_EXPIRED`, sem retry — o frontend deve orientar uma nova busca.

## Segurança e privacidade

- `POST /v1/searches/flights` é a primeira rota pública com rate limit real
  do projeto: `@nestjs/throttler`, guard aplicado só nesta rota (não
  `APP_GUARD` global), configurado via `RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX`
  (já documentadas como `PROPOSTO` em `CLAUDE.md` §10.3 desde antes desta
  spec — primeira feature a consumi-las de verdade). Exceção da lib
  sobrescrita (`SearchThrottlerGuard.throwThrottlingException`) para cair no
  mesmo formato `{code, message}` do resto da API;
- `purchaseUrl` passa pela mesma allowlist de host/esquema `https:` do
  SPEC-018 antes de qualquer URL chegar à resposta HTTP;
- dado do provider (payload bruto) não entra em log — `logEvent('flight_search',
...)` só carrega `flightSearchId`/`result`/`offersCount`/`errorCode`/`correlationId`;
- autorização por ownership em `POST /v1/offers/:id/watch` reusa
  `SessionAuthGuard`; não há ownership de `FlightSearch`/`FlightSearchOffer`
  em si (são dados públicos por natureza — rota, data, preço observado).

## Observabilidade

- `flight_search_total{result,mode}` — `result`: `succeeded`/`failed`;
  `mode`: `sync` (único valor possível nesta fatia; o label já existe para
  quando `async` existir, sem precisar renomear a métrica depois);
- `flight_search_duration_seconds{provider}` — histograma, duração da
  chamada ao provider;
- `flight_offers_returned_total{provider}` — contagem de ofertas elegíveis
  devolvidas;
- `flight_offer_watch_derive_total{result}` — `success` ou o `errorCode`
  em minúsculo (`offer_not_found`, `offer_expired`, mais os códigos de
  `CreateWatchError` quando `createWatch()` falha) — consistência com o
  padrão de 1-counter-por-método já usado em `watchCreateTotal`/
  `authRegisterTotal` (não estava na lista original do rascunho, adicionado
  por consistência com o resto da API);
- log estruturado (`flight_search`) com `flightSearchId`, `result`,
  `offersCount`/`errorCode`, `correlationId` — nunca a URL completa nem
  payload do provider.

## Performance e orçamento de custo

Mesma meta de SPEC-001 §14 (p95 abaixo de 500ms) para a fronteira HTTP —
como a chamada ao provider é síncrona e in-process (sem rede), a latência
real observada em smoke test foi sub-milissegundo
(`flight_search_duration_seconds_sum ≈ 0.0006s` para uma busca). Quando um
provider real (rede) existir, essa meta precisa ser revalidada — não é
garantida pela arquitetura, só pelo provider simulado.

## Critérios de aceitação

- AC-001: uma busca válida com rota suportada retorna `201`, `status:
SUCCEEDED`, e ao menos a oferta determinística do `SimulatedFlightProvider`;
- AC-002: `maxStops`/`maxPriceMinor` filtram ofertas de verdade — uma busca
  com `maxPriceMinor` abaixo de qualquer preço possível retorna `SUCCEEDED`
  com `offers: []`, nunca `FAILED`;
- AC-003: `origin === destination`, ou `returnDate` inconsistente com
  `tripType`, ou `departureDate` no passado → `400 INVALID_SEARCH_INPUT`;
- AC-004: rota/moeda/mercado fora do catálogo placeholder → `422
UNSUPPORTED_SEARCH`;
- AC-005: `GET /v1/searches/flights/:id` devolve exatamente o que a busca
  persistiu, com `purchaseUrl`/`availabilityStatus` recalculados na leitura;
  id inexistente → `404 FLIGHT_SEARCH_NOT_FOUND`;
- AC-006: `POST /v1/offers/:id/watch` sem autenticação → `401`;
- AC-007: oferta inexistente → `404 OFFER_NOT_FOUND`; oferta expirada →
  `410 OFFER_EXPIRED`, sem criar Watch;
- AC-008: `POST /v1/offers/:id/watch` bem-sucedido cria um Watch cujo
  `GET /v1/watches` **imediatamente** (sem esperar o scheduler) mostra
  `currentOffer` com o mesmo `amountMinor`/`purchaseUrl` da oferta
  escolhida;
- AC-009: repetir `POST /v1/offers/:id/watch` com a mesma `Idempotency-Key`
  devolve o mesmo Watch, sem duplicar `SearchExecution`/`PriceObservation`;
- AC-010: a Nª+1 requisição a `POST /v1/searches/flights` dentro da janela
  configurada retorna `429 RATE_LIMITED`, no mesmo formato `{code,
message}` do resto da API;
- AC-011 (frontend): abrir a página de resultados nunca cria Watch sozinho
  — "Monitorar" exige confirmação explícita (preencher o preço-alvo no
  modal); o link de compra, quando existe, abre com `noopener,noreferrer`.

## Testes e evals

- unitário: `packages/contracts/src/searches/create-flight-search.test.ts`
  (10 casos: payload válido, campo desconhecido, invariantes de viagem
  compartilhadas, `ANYWHERE` rejeitado, limites de `maxStops`/`maxPriceMinor`,
  defaults) e `derive-watch.test.ts` (5 casos, incluindo reuso da checagem
  de tipos de regra duplicados);
- e2e (Testcontainers, `apps/api/src/searches/searches.e2e.spec.ts`, mesmo
  padrão de `watches.e2e.spec.ts`): 14 testes cobrindo AC-001 a AC-010,
  incluindo um teste de rate limit numa **instância de app isolada**
  (`ThrottlerStorageService` é um provider por container de DI — sem
  isolar, o teste dedicado consumiria o mesmo orçamento que o resto da
  suíte já usa) — achado real ao escrever este teste: a primeira versão
  esquecia `registerCorrelationHook` na instância isolada, fazendo as 15
  requisições "dentro do limite" falharem com 500 (correlationId ausente)
  em vez de 201, e o teste só checava a última resposta — "passava" pelo
  motivo errado. Corrigido antes de considerar o teste válido.

## Rollout, rollback e kill switch

Migração aditiva (duas tabelas novas, nenhuma coluna alterada em tabela
existente) — sem risco de dado. Sem feature flag dedicada: as duas rotas
públicas (`POST`/`GET /v1/searches/flights`) e a rota autenticada
(`POST /v1/offers/:id/watch`) são inteiramente novas — nenhum cliente
existente as chama, então não há comportamento publicado para quebrar.
Rollback é reverter o deploy; nenhum dado é alterado de forma destrutiva
(as duas tabelas novas ficam órfãs, sem FK de saída de nenhuma tabela
pré-existente exceto o `userId` opcional em `FlightSearch`).

## Questões em aberto

- **armazenamento do throttler em memória, por processo**: correto para o
  deployment atual (uma única instância da API); sob múltiplas réplicas,
  cada uma teria sua própria contagem, e a capacidade real seria
  `RATE_LIMIT_MAX × número de réplicas`. Não é um bloqueio hoje, mas precisa
  de uma decisão explícita (storage compartilhado via Redis, por exemplo)
  antes de escalar horizontalmente a API;
- **`trustProxy` não configurado no `FastifyAdapter`**: sem um proxy reverso
  na frente da API hoje, `req.ip` já é o IP real do cliente. Quando um
  proxy/load balancer existir, isso precisa ser configurado, senão o rate
  limit efetivamente vira global (todo tráfego aparentando vir do proxy);
- **`OFFER_EXPIRED` → rejeitar vs. criar mesmo assim**: esta spec rejeita
  (410); SPEC-018 mantém `currentOffer` mesmo expirado para um Watch já
  existente. São decisões diferentes para situações diferentes (criar novo
  vs. exibir existente), mas a assimetria merece uma segunda opinião;
- **`FlightSearch.userId` sempre `null`**: quando uma spec futura precisar
  de "minhas buscas anteriores" (`POST /v1/searches/:id/save`, no doc de
  domínio), vai precisar de um guard de autenticação opcional que não
  existe ainda — não construído aqui por não ter consumidor;
- **efeito colateral do `startsAt` vs. `observedAt` semeado** (ver
  "Comportamento de domínio"): comportamento herdado e já aceito de
  SPEC-009/018, não uma regressão — mas vale considerar, numa spec futura,
  se `lowestPrice` deveria enxergar a observação semeada quando ela é,
  na prática, o primeiro preço que o próprio usuário escolheu monitorar.

## Evidência de implementação

Status: implementado e verificado em 2026-09-21.

### Arquivos principais

- `packages/database/prisma/schema.prisma` — `FlightSearchStatus`,
  `FlightSearch`, `FlightSearchOffer`; migração
  `20260921213059_flight_discovery`.
- `packages/contracts/src/shared/trip-fields.ts` (novo) — `iataCodeSchema`/
  `isoDateSchema`/`currencyCodeSchema`/`marketCodeSchema` extraídos de
  `watches/create-watch.ts` para reuso.
- `packages/contracts/src/shared/trip-validation.ts` (novo) —
  `applyTripInvariants`, idem.
- `packages/contracts/src/searches/{create-flight-search,derive-watch,errors}.ts`
  (novos) + testes.
- `packages/contracts/src/watches/create-watch.ts` — `assertUniqueAlertRuleTypes`
  exportado e reusado por `derive-watch.ts`.
- `packages/database/src/flight-search-repository.ts` (novo) —
  `createPendingFlightSearch`, `completeFlightSearch`,
  `getFlightSearchWithOffers`, `getFlightSearchOfferForDerive`.
- `apps/api/src/searches/` (novo módulo) — `searches.module.ts`,
  `searches.controller.ts`, `offers.controller.ts`, `searches.service.ts`
  (orquestração completa), pipes, filtros, `search-throttler.guard.ts`,
  `flight-provider.token.ts`.
- `apps/api/src/watches/watches.module.ts` — `exports: [WatchesService]`.
- `apps/api/src/observability/metrics.service.ts` — 4 métricas novas.
- `apps/web/src/lib/api/{searches.ts,types.ts}`, `apps/web/src/app/search/`
  (novo: `page.tsx`, `search-form.tsx`, `actions.ts`, `[id]/page.tsx`,
  `[id]/offer-card.tsx`, `[id]/actions.ts`), `site-header.tsx` (link novo).
- `apps/web/src/lib/domain/money.ts` — `parseAmountMinor` extraído de
  `watches/new/new-watch-form.tsx` para reuso em `search/[id]/offer-card.tsx`.

### Comandos executados (resultado real)

- `pnpm --filter @flight-watch/database build` — migração aplicada, client
  regenerado.
- `pnpm -w typecheck` — 20/20 pacotes ok.
- `pnpm -w lint` — 13/13 pacotes ok.
- `pnpm -w test` — 20/20 tasks ok; `apps/api` 110/110 testes (96
  pré-existentes + 14 novos e2e cobrindo AC-001 a AC-010, incluindo o
  teste de rate limit com instância de app isolada).
- `pnpm -w build` — 13/13 tasks ok; Next.js gera `/search` e `/search/[id]`
  como rotas dinâmicas normalmente.

### Smoke test ao vivo (processos reais já em execução, sem mocks)

Contra `apps/api` (nodemon, porta 3000) já rodando:

1. `POST /v1/searches/flights` sem token → `201`, `status: SUCCEEDED`,
   1 oferta real do `SimulatedFlightProvider` com `purchaseUrl` no host
   allowlisted e `availabilityStatus: CURRENT`.
2. `GET /v1/searches/flights/:id` → `200`, mesmo conteúdo; id inexistente
   → `404`.
3. Registro real de usuário + verificação do canal via `UPDATE` direto no
   Postgres (mesmo padrão de smoke test do SPEC-018) + `POST
/v1/offers/:id/watch` → `201`, Watch criado.
4. `GET /v1/watches` imediatamente depois → `currentPrice`/`currentOffer`
   já populados, com o **mesmo** `amountMinor`/`purchaseUrl` da oferta
   escolhida no passo 1 — confirma que `seedInitialObservation` funciona de
   ponta a ponta contra o banco real, sem esperar o scheduler.
   `lowestPrice: null` observado e explicado em "Comportamento de domínio"
   (efeito colateral aceito, não bug).
5. Casos negativos confirmados ao vivo: `origin === destination` → `400
INVALID_SEARCH_INPUT`; moeda não suportada → `422 UNSUPPORTED_SEARCH`;
   oferta inexistente → `404 OFFER_NOT_FOUND`; sem token → `401`.
6. Rate limit: 10 requisições consecutivas a `POST /v1/searches/flights`
   (limite padrão de 10, já com 3 requisições anteriores na mesma janela)
   → as duas últimas retornaram `429 RATE_LIMITED` no formato `{code,
message}` padrão da API.
7. `GET http://localhost:9100/metrics` confirmou as 4 métricas novas com
   labels corretos: `flight_search_total{result="succeeded",mode="sync"}`,
   `flight_search_duration_seconds` (histograma populado),
   `flight_offers_returned_total{provider="SIMULATED"}`,
   `flight_offer_watch_derive_total{result="success"}` e
   `{result="offer_not_found"}`.
8. Efeito colateral não previsto, mas correto (mesmo já visto no smoke test
   do SPEC-018): o preço simulado nasceu abaixo do `targetAmountMinor` de
   teste, disparando o pipeline real de alerta/notificação — exigiu limpar
   `notification_deliveries`/`alert_events` além de
   `watches`/`alert_rules`/`notification_channels`/`users`/`flight_searches`/
   `flight_search_offers` ao remover os dados de teste do banco de
   desenvolvimento.

Frontend: sem Playwright configurado neste ambiente (confirmado) —
verificação por `pnpm -w build` (rotas geradas corretamente) e leitura de
código; sem verificação visual manual em navegador — documentado como gap,
não como testado, mesmo padrão do SPEC-018.
