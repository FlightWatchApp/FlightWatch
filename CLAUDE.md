# CLAUDE.md — Flight Watch

> Constituição operacional viva para agentes de IA e pessoas que trabalham neste repositório.

**Versão documental:** 0.1  
**Última atualização:** 2026-09-21  
**Produto:** Flight Watch  
**Idioma do produto e da documentação:** português brasileiro  
**Timezone operacional humano:** `America/Campo_Grande`  
**Timezone de persistência, eventos, filas e observabilidade:** UTC

---

## 0. Como usar este documento

Este arquivo deve ser lido integralmente antes de qualquer alteração relevante. Ele não substitui specs, ADRs, testes ou código. Sua função é:

- explicar o produto e os limites arquiteturais;
- indicar onde buscar a fonte de verdade;
- orientar o fluxo de trabalho do Claude;
- registrar convenções transversais;
- impedir que decisões provisórias sejam tratadas como definitivas;
- manter um mapa atualizado do repositório;
- documentar obstáculos recorrentes e soluções já aprovadas;
- garantir que novas features evoluam por spec, evals e testes.

### 0.1 Classificação obrigatória das informações

Toda informação arquitetural relevante deve estar em uma destas classes:

| Marcador     | Significado                                                   |
| ------------ | ------------------------------------------------------------- |
| `VERIFICADO` | Confirmado no código, testes ou execução atual                |
| `APROVADO`   | Decisão formalizada em spec, ADR ou documento de domínio      |
| `PROPOSTO`   | Baseline ainda não comprovada ou não implementada             |
| `BLOQUEADO`  | Depende de decisão, contrato, credencial ou validação externa |
| `DEPRECATED` | Mantido apenas para migração ou compatibilidade temporária    |

Não promover silenciosamente `PROPOSTO` para `VERIFICADO`. Para promover, citar o arquivo, teste, comando ou execução que comprova a mudança.

### 0.2 Ordem de autoridade

Em caso de conflito, obedecer esta ordem:

1. legislação, segurança e contrato externo aplicável;
2. spec aprovada da feature;
3. `DOMAIN.md` e invariantes de domínio;
4. ADR aceito;
5. contrato público versionado: OpenAPI, evento ou job;
6. testes e evals aprovados;
7. `ARCHITECTURE.md`;
8. `PRODUCT.md`;
9. este `CLAUDE.md`;
10. comentários e convenções locais.

Conflitos nunca devem ser resolvidos silenciosamente. Registrar a divergência e atualizar o documento desatualizado no mesmo conjunto de alterações.

### 0.3 Protocolo de atualização viva

Ao concluir uma feature, correção ou refatoração relevante, verificar se é necessário atualizar:

- mapa de apps e packages;
- variáveis de ambiente;
- models e estados;
- contratos de jobs/eventos;
- métricas e runbooks;
- common hurdles;
- design patterns;
- comandos e quality gates;
- status do roadmap;
- spec, ADR, `DESIGN-SYSTEM.md` e este arquivo.

O Claude não deve aumentar este arquivo com detalhes efêmeros. Detalhes extensos pertencem a specs, ADRs e runbooks; aqui deve ficar o mapa operacional e a regra transversal.

---

## 1. Estado atual resumido

### 1.1 Verificado no último ciclo reportado

- Monorepo TypeScript com 13 pacotes passando `format`, `lint`, `typecheck`, testes e build.
- Processos executados conjuntamente: `api`, `scheduler`, `price-worker`, `alert-worker` e `notification-worker`.
- Fluxo ponta a ponta validado com provedor simulado: usuário → Watch → scheduler → busca → observação → alerta → entrega de e-mail.
- Desligamento gracioso confirmado nos cinco processos.
- Pacote `packages/observability` implementado.
- `/health` público retorna apenas estado sanitizado.
- `/metrics` não é exposto pela porta HTTP pública da API.
- Métricas são servidas por listener dedicado, com `METRICS_HOST=127.0.0.1` e `METRICS_PORT=9100` por padrão.
- Health check do PostgreSQL possui timeout explícito de 2 segundos.
- Métricas de negócio existem no scheduler, price-worker, alert-worker e notification-worker.
- Specs 002 a 006 possuem nomes concretos de métricas.
- `ADR-007-observability.md` registra a estratégia de observabilidade.
- SPEC-018 (link de compra a partir de um Watch), SPEC-014 (busca de
  descoberta síncrona, `POST/GET /v1/searches/flights`,
  `POST /v1/offers/:id/watch`), SPEC-015 (feed de oportunidades,
  `GET /v1/opportunities`, `Deal` computado em leitura, nunca persistido) e
  SPEC-016 (mapa de oportunidades em `/opportunities`, OpenStreetMap +
  Leaflet) implementadas e verificadas — ver evidência de implementação em
  cada spec.
- Primeira rota pública com rate limit real (`@nestjs/throttler`,
  `POST /v1/searches/flights`) — `RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX`
  agora `VERIFICADO` (§10.2).

### 1.2 Aprovado arquiteturalmente

- Monólito modular com processos separáveis.
- PostgreSQL como fonte de verdade.
- Redis/BullMQ para filas, cache reconstruível, coordenação e rate limiting.
- `Watch` separado de `SearchTarget`.
- Deduplicação por chave canônica versionada e fingerprint.
- Adaptadores de provedores por ports and adapters.
- Jobs com semântica at-least-once e efeitos idempotentes.
- Outbox transacional para evitar dual-write.
- `PriceObservation` imutável.
- Alertas determinísticos; LLM não participa da decisão básica.
- Dinheiro armazenado em unidade monetária mínima inteira.

### 1.3 Bloqueios e decisões pendentes

- `BLOQUEADO`: integração real depende de esclarecimento/aceite contratual da Duffel sobre metasearch e polling recorrente.
- `BLOQUEADO`: nenhum provedor real deve entrar em produção antes da validação jurídica/comercial.
- `PROPOSTO`: canal inicial comercial de notificação. E-mail existe no fluxo simulado; WhatsApp não está aprovado como canal inicial.
- `PROPOSTO`: monetização e limites de plano.
- `PROPOSTO`: intervalos finais de polling e orçamento por classe.
- `PROPOSTO`: política definitiva de retenção e agregação de observações.
- `PROPOSTO`: SLOs finais após piloto com provedor real.

---

## 2. Visão do produto

Flight Watch é uma plataforma de observação de preços de viagens. O usuário cadastra uma intenção de viagem e regras de alerta. O sistema consulta provedores autorizados, registra o histórico observado e envia notificação quando uma regra é atendida.

### 2.1 O produto faz

- cria e gerencia monitoramentos;
- compartilha pesquisas equivalentes entre usuários;
- consulta provedores de forma assíncrona;
- registra preços observados;
- exibe histórico e idade do dado;
- detecta preço-alvo, queda absoluta, queda percentual e novo menor observado;
- aplica cooldown e idempotência;
- entrega notificações por canais aprovados;
- mede frescor, custo, falhas e efetividade.

### 2.2 O produto não faz no MVP

- não vende, reserva ou emite passagens;
- não recebe pagamento pela passagem;
- não se apresenta como agência de viagens;
- não faz scraping não autorizado;
- não promete o menor preço de todo o mercado;
- não monitora milhas;
- não usa LLM para decidir alertas determinísticos;
- não prevê preço por IA;
- não oferece datas flexíveis ou múltiplos aeroportos no primeiro MVP;
- não oculta idade, origem ou limitações do preço.

### 2.3 Linguagem obrigatória

Usar “menor preço observado pelo sistema” e nunca “menor preço do mercado” ou “menor preço garantido”. Diferenciar claramente:

- preço atual observado;
- preço desejado;
- menor preço observado;
- ausência de oferta;
- falha na consulta;
- dado desatualizado;
- Watch pausado, expirado ou cancelado.

---

## 3. Visão geral da arquitetura

```text
Usuário
  │
  ▼
Web / Next.js
  │ REST/OpenAPI
  ▼
API / NestJS + Fastify
  │
  ├── PostgreSQL ── fonte de verdade + outbox
  └── Redis/BullMQ ── filas, locks, cache e rate limit
                         │
                  ┌──────┼─────────┐
                  ▼      ▼         ▼
             Scheduler  Price   Alert Worker
                        Worker       │
                          │          ▼
                          ▼     Notification Worker
                    FlightProvider    │
                                      ▼
                              E-mail / canal aprovado
```

### 3.1 Princípios arquiteturais

1. Simplicidade operacional antes de distribuição prematura.
2. Módulos explícitos antes de microserviços.
3. Escala horizontal por processo quando necessário.
4. Dados persistentes no PostgreSQL; Redis deve ser reconstruível.
5. Chamada externa sempre falível, limitada e observável.
6. Processamento at-least-once com idempotência persistente.
7. Contrato antes da implementação.
8. Observabilidade como requisito funcional.
9. Segurança e privacidade por minimização.
10. Evolução guiada por spec, eval e telemetria.

### 3.2 Bounded contexts

| Contexto      | Responsabilidade                                         |
| ------------- | -------------------------------------------------------- |
| Identity      | usuários, autenticação, canais verificados e autorização |
| Monitoring    | Watches, AlertRules, SearchTargets e agenda              |
| Pricing       | busca, normalização, execuções e observações             |
| Alerting      | avaliação determinística, cooldown e AlertEvents         |
| Notifications | templates, tentativas e entregas                         |
| Operations    | provedores, cotas, observabilidade, auditoria e retenção |

---

## 4. Stack tecnológica

Antes de modificar versões ou bibliotecas, conferir `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` e `turbo.json`. A tabela registra a baseline conhecida; o lockfile é autoridade para versões exatas.

| Área         | Tecnologia                         | Estado                           | Regra                                             |
| ------------ | ---------------------------------- | -------------------------------- | ------------------------------------------------- |
| Linguagem    | TypeScript estrito                 | APROVADO                         | não introduzir `any` sem justificativa localizada |
| Monorepo     | pnpm workspaces                    | APROVADO                         | um único lockfile                                 |
| Orquestração | Turborepo                          | APROVADO                         | tarefas cacheáveis e dependências explícitas      |
| Web          | Next.js + React                    | APROVADO                         | confirmar versão e App Router no código           |
| API          | NestJS                             | VERIFICADO                       | módulos por contexto                              |
| HTTP adapter | Fastify                            | VERIFICADO                       | não expor métricas na porta pública               |
| Contratos    | REST + OpenAPI                     | APROVADO                         | contratos versionados                             |
| Validação    | Zod                                | APROVADO                         | validar em toda fronteira                         |
| Banco        | PostgreSQL                         | APROVADO                         | fonte de verdade                                  |
| ORM          | Prisma                             | VERIFICADO                       | migrações publicadas são imutáveis                |
| Cache/fila   | Redis + BullMQ                     | APROVADO                         | nenhum estado de domínio apenas no Redis          |
| Testes       | Vitest                             | APROVADO                         | unitário e integração                             |
| Integração   | Testcontainers                     | PROPOSTO/confirmar               | PostgreSQL e Redis reais no gate                  |
| E2E web      | Playwright                         | APROVADO/confirmar               | jornadas críticas                                 |
| Métricas     | Prometheus client/registry interno | VERIFICADO                       | baixa cardinalidade                               |
| Tracing      | OpenTelemetry                      | APROVADO/confirmar implementação | `correlation_id` ponta a ponta                    |
| Logs         | JSON estruturado                   | VERIFICADO                       | redigir campos sensíveis                          |
| Containers   | Docker/Compose                     | APROVADO                         | paridade local/CI                                 |
| CI/CD        | GitHub Actions                     | APROVADO/confirmar workflows     | gates bloqueiam merge                             |

### 4.1 Dependências proibidas por acoplamento

- `packages/domain` não importa NestJS, Prisma, BullMQ, Redis, SDK de provider ou React.
- apps podem depender de packages; packages de domínio não dependem de apps.
- adaptadores externos implementam portas internas.
- tipos de SDK externo não atravessam o adaptador.
- componentes de UI não importam cliente de banco, fila ou secrets.

---

## 5. Estrutura do repositório

Esta árvore deve ser reconciliada com `rg --files` no início de tarefas estruturais.

```text
/
├── AGENTS.md                     # regras para agentes (Codex, Cursor, Claude…)
├── CLAUDE.md
├── README.md
├── package.json · pnpm-lock.yaml · pnpm-workspace.yaml · turbo.json · .nvmrc
├── apps/
│   ├── web/src/
│   │   ├── app/                  # App Router (rotas e server actions)
│   │   ├── components/
│   │   ├── lib/
│   │   └── styles/
│   ├── api/src/
│   │   ├── auth/ watches/ searches/ opportunities/ affiliate/
│   │   ├── observability/
│   │   ├── prisma/
│   │   └── main.ts
│   ├── scheduler/src/
│   ├── price-worker/src/
│   ├── alert-worker/src/
│   └── notification-worker/src/
├── packages/
│   ├── domain/ contracts/ database/ queue/
│   ├── providers/ notifications/ observability/ config/
│   └── (testing/ ui/ — PROPOSTO, ainda não existem)
├── docs/                         # índice em docs/README.md
│   ├── PRODUCT.md DOMAIN.md ARCHITECTURE.md
│   ├── EVALS.md QUALITY-GATES.md
│   ├── BRAND.md DESIGN-SYSTEM.md
│   ├── adr/
│   ├── specs/
│   ├── evals/
│   ├── roadmap/                  # próximas fases + rascunhos/ de spec
│   ├── design-refactor/          # refactor web v2 (decisões, tasks, evals)
│   ├── reviews/
│   └── (runbooks/ — PROPOSTO, ainda não existe)
├── scripts/design/               # pnpm check:design
└── .local/                       # rascunho pessoal, ignorado pelo git
```

Testes vivem junto do código (`*.test.ts`, `*.spec.ts`, `*.integration.test.ts`);
não há `tests/` nem `evals/` na raiz.

### 5.1 Estrutura do conteúdo e documentação

| Conteúdo                | Local                           | Atualização                           |
| ----------------------- | ------------------------------- | ------------------------------------- |
| visão e escopo          | `docs/PRODUCT.md`               | mudança de produto                    |
| domínio e invariantes   | `docs/DOMAIN.md`                | nova regra, entidade ou estado        |
| arquitetura consolidada | `docs/ARCHITECTURE.md`          | mudança transversal                   |
| decisão arquitetural    | `docs/adr/ADR-NNN-*.md`         | decisão relevante e suas alternativas |
| feature                 | `docs/specs/SPEC-NNN-*.md`      | antes do código                       |
| evals                   | `docs/EVALS.md` e `docs/evals/` | comportamento crítico/regressão       |
| quality gates           | `docs/QUALITY-GATES.md`         | mudança no processo de aceite         |
| design system           | `docs/DESIGN-SYSTEM.md`         | decisão visual significativa          |
| incidente/operação      | `docs/runbooks/`                | novo modo de falha                    |
| instruções do Claude    | `CLAUDE.md`                     | convenção transversal/mudança do mapa |

Não criar cópias conflitantes. Rascunhos de spec ficam em `docs/roadmap/rascunhos/` até entrarem no processo; aí passam a `docs/specs/`.

---

## 6. Apps: responsabilidades, serviços, jobs e models

### 6.1 `apps/web`

**Responsabilidade:** experiência do usuário e composição de interface.

**Serviços esperados:**

- `ApiClient`: contratos tipados com a API;
- `AuthSessionService`: sessão sem expor tokens;
- `WatchViewService`: projeções e formatação;
- `TelemetryClient`: eventos de produto sem PII desnecessária;
- `FeatureFlagClient`: apenas se aprovado por ADR.

**Models/view models:**

- `WatchListItem`;
- `WatchDetailsView`;
- `PriceHistoryPoint`;
- `AlertExplanationView`;
- `CreateWatchForm`;
- `NotificationPreferencesForm`.

**Regras:**

- domínio não é reimplementado no browser;
- valores monetários vêm tipados como inteiro/moeda ou string contratual segura;
- estados loading/empty/error/stale/no-offers são distintos;
- seguir `docs/DESIGN-SYSTEM.md`;
- não chamar provider de voo diretamente.

### 6.2 `apps/api`

**Responsabilidade:** fronteira HTTP, autenticação, autorização, CRUD, leitura e comandos de aplicação.

**Controllers/módulos esperados:**

- Auth/Identity;
- Users;
- NotificationChannels;
- Watches;
- AlertRules;
- PriceHistory;
- Searches/Offers (SPEC-014: busca de descoberta pública e derivação de Watch a partir de uma oferta);
- Opportunities (SPEC-015: feed público de oportunidades, `Deal` computado em leitura);
- Health;
- Observability interna.

**Serviços:**

- `CreateWatchService`;
- `ListWatchesService`;
- `GetWatchService`;
- `PauseWatchService`;
- `ResumeWatchService`;
- `CancelWatchService`;
- `UpdateAlertRulesService`;
- `GetPriceHistoryService`;
- `VerifyNotificationChannelService`.

**Jobs publicados:**

- nenhum efeito externo deve depender de publicação direta fora da outbox;
- `WatchCreated.v1`;
- `WatchActivated.v1`;
- `WatchPaused.v1`;
- `WatchTerminated.v1`.

### 6.3 `apps/scheduler`

**Responsabilidade:** selecionar SearchTargets elegíveis e criar execuções de busca sem exceder orçamento/cotas.

**Serviços:**

- `ScheduleEligibleTargets`;
- `ComputeTargetPriority`;
- `AcquireScheduleLease`;
- `ReconcileAbandonedLeases`;
- `ExpireWatches`;
- `EnforceProviderBudget`.

**Job produzido:** `PriceCheckRequested.v1`.

**Models operacionais:**

- `ScheduleCandidate`;
- `ScheduleWindow`;
- `Lease`;
- `ProviderBudgetSnapshot`;
- `SchedulerTickResult`.

**Métricas verificadas/requeridas:**

- jobs criados por resultado/motivo;
- targets atrasados por prioridade;
- erros de tick;
- `scheduler_reconciliations_total{reason}`;
- razões conhecidas: `abandoned_lease`, `retry_exhausted`, `watch_expired`.

### 6.4 `apps/price-worker`

**Responsabilidade:** consumir verificação, aplicar cota/rate limit, consultar adapter, normalizar e persistir resultado.

**Serviços:**

- `ProcessPriceCheckJob`;
- `SelectFlightProvider`;
- `NormalizeProviderOffers`;
- `SelectBestEligibleOffer`;
- `PersistPriceObservation`;
- `ClassifyProviderError`;
- `ComputeNextCheckAt`.

**Job consumido:** `PriceCheckRequested.v1`.  
**Evento produzido via outbox:** `PriceObserved.v1` ou conclusão sem oferta/falha tipada.

**Models:**

- `FlightSearchQuery`;
- `ProviderContext`;
- `ProviderSearchResult`;
- `FlightOffer`;
- `NormalizedSegment`;
- `OfferSelectionResult`;
- `ProviderError`.

`persistPriceObservationSuccess` retorna `{ observation, created }`; todos os call sites devem respeitar `created` para evitar métrica/evento duplicado em replay.

### 6.5 `apps/alert-worker`

**Responsabilidade:** avaliar regras de Watches ativos vinculados à observação.

**Serviços:**

- `EvaluatePriceObservedJob`;
- `ResolveReferenceObservation`;
- `EvaluateAlertRuleFormula`;
- `ApplyCooldown`;
- `PersistAlertEvent`;
- `CheckpointFanoutPage`.

**Job consumido:** `PriceObserved.v1`.  
**Evento produzido:** `NotificationRequested.v1` quando elegível.

**Models:**

- `RuleEvaluationContext`;
- `RuleEvaluationResult`;
- `AlertTriggerExplanation`;
- `AlertFanoutCheckpoint`.

**Métricas verificadas:**

- `alert_rules_evaluated_total{type,result}`;
- resultados: `triggered`, `not_triggered`, `no_reference`;
- `alert_events_total{outcome}`;
- outcomes: `queued`, `suppressed`, `idempotent_replay`;
- `alert_event_lag_seconds`;
- `alert_worker_pages_processed_total`;
- `alert_worker_watch_skipped_total{reason}`.

### 6.6 `apps/notification-worker`

**Responsabilidade:** renderizar e entregar notificações idempotentes.

**Serviços:**

- `ProcessNotificationJob`;
- `ResolveNotificationChannel`;
- `RenderNotificationTemplate`;
- `SendEmail`;
- `ClassifyDeliveryError`;
- `MarkNotificationDeliveryResult`.

**Job consumido:** `NotificationRequested.v1`.  
**Eventos produzidos:** `NotificationDelivered.v1`, `NotificationFailed.v1`.

**Models:**

- `NotificationTemplateContext`;
- `DeliveryResult`;
- `DeliveryError`;
- `NotificationDestinationRef`.

**Métricas verificadas:**

- `notification_deliveries_total{channel,status,templateVersion}`;
- `notification_delivery_lag_seconds{channel}`;
- `notification_delivery_attempts_total{channel}`;
- `notification_duplicate_deliveries_prevented_total`.

### 6.7 Outbox publisher

Pode estar embutido em processo atual ou separado. Antes de alterar, localizar a implementação real.

**Responsabilidade:** publicar eventos confirmados no PostgreSQL e marcar resultado sem perder eventos.

**Serviços:**

- `ClaimOutboxBatch`;
- `PublishOutboxEvent`;
- `MarkOutboxPublished`;
- `ReleaseExpiredClaims`;
- `MovePoisonEventToReview`.

---

## 7. Packages: ownership e contratos

| Package         | Ownership                                                       |
| --------------- | --------------------------------------------------------------- |
| `domain`        | entidades, value objects, regras puras, estados e portas        |
| `contracts`     | DTOs, schemas Zod, OpenAPI, eventos e job envelopes             |
| `database`      | Prisma, repositories, transações, outbox e integração           |
| `queue`         | nomes de filas, publisher/consumer e políticas BullMQ           |
| `providers`     | portas/adapters de busca, mock e futuros providers reais        |
| `notifications` | portas de canais, templates e adapters                          |
| `observability` | logger, registry, métricas, servidor interno e correlação       |
| `config`        | leitura/validação centralizada de environment                   |
| `testing`       | builders, clocks, fakes, fixtures e harnesses                   |
| `ui`            | tokens/componentes compartilhados, se existir e for justificado |

Cada package deve exportar uma superfície pública pequena. Não importar arquivos internos por caminhos profundos para contornar exports.

---

## 8. Models e invariantes centrais

| Model                              | Papel                                              | Invariantes essenciais                                                         |
| ---------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------ |
| `User`                             | proprietário                                       | somente ativo usa canal verificado                                             |
| `NotificationChannel`              | destino autorizado                                 | pertence ao usuário; verificado; revogável                                     |
| `Watch`                            | intenção individual                                | terminal não retorna a ativo                                                   |
| `AlertRule`                        | condição versionada                                | fórmula/referência explícitas                                                  |
| `SearchTarget`                     | busca compartilhada                                | fingerprint único por schema                                                   |
| `SearchExecution`                  | tentativa lógica                                   | chave idempotente; status tipado                                               |
| `FlightOffer`                      | oferta normalizada                                 | total, moeda, passageiros e itinerário válidos                                 |
| `PriceObservation`                 | fotografia imutável                                | nunca atualizar preço/itinerário                                               |
| `AlertEvent`                       | regra atendida                                     | deduplication key única                                                        |
| `NotificationDelivery`             | tentativa de entrega                               | delivery key única por canal/template                                          |
| `Provider`                         | integração                                         | estado, capacidade e estratégia                                                |
| `ProviderQuota`                    | orçamento/cota                                     | não permitir consumo invisível                                                 |
| `OutboxEvent`                      | publicação eventual                                | criado no mesmo commit do domínio                                              |
| `FlightSearch`/`FlightSearchOffer` | busca de descoberta pontual (SPEC-014)             | separado de SearchTarget/SearchExecution; não compartilha tabelas              |
| `Deal`                             | classificação de oportunidade computada (SPEC-015) | **não é model Prisma** — nunca persistido, recalculado a cada leitura (DR-019) |

### 8.1 Dinheiro

- armazenar em unidade mínima inteira: `97010 BRL`, nunca `970.10` float;
- sempre carregar código de moeda;
- não comparar moedas diferentes;
- conversão futura exige fonte, timestamp e spec;
- preço zero não representa ausência de oferta.

### 8.2 Tempo

- persistir instantes em UTC;
- datas de viagem obedecem mercado/rota e não devem sofrer shift de timezone;
- relógio deve ser injetável em domínio e testes;
- `Date.now()` fica em bordas operacionais, não em função pura;
- cron humano usa `America/Campo_Grande`; cron de infraestrutura deve documentar timezone explicitamente.

---

## 9. Jobs, eventos e filas

### 9.1 Envelope obrigatório

```ts
interface JobEnvelopeV1<T> {
  schemaVersion: 1;
  jobId: string;
  idempotencyKey: string;
  correlationId: string;
  requestedAt: string; // RFC3339 UTC
  payload: T;
}
```

### 9.2 Regras

- payload mínimo, preferencialmente IDs;
- sem segredo, e-mail completo ou payload bruto do provider;
- schema versionado;
- consumidor rejeita versão desconhecida de modo observável;
- retry preserva idempotency key;
- dead-letter não é apagada automaticamente;
- replay exige autorização, motivo e auditoria;
- evento representa fato passado; comando/job representa intenção.

### 9.3 Fluxo nominal

```text
WatchCreated
  → SearchTarget elegível
  → PriceCheckRequested
  → SearchExecution
  → PriceObserved
  → AlertEvent
  → NotificationRequested
  → NotificationDelivered | NotificationFailed
```

---

## 10. Variáveis de ambiente

### 10.1 Regras de governança

1. O schema em `packages/config` é a fonte de verdade operacional.
2. `.env.example` deve conter todas as chaves sem segredos reais.
3. Toda nova variável exige validação, documentação, default seguro e owner.
4. Segredos nunca entram em Git, logs, fixtures ou respostas de erro.
5. Variável pública do Next.js deve ser tratada como visível ao usuário.
6. Falhar no startup quando configuração obrigatória estiver ausente.
7. Não ler `process.env` espalhado pelo domínio; centralizar configuração.

### 10.2 Variáveis verificadas

`VERIFICADO` (SPEC-024): a fonte de verdade é `packages/config/src/processes.ts`,
e toda chave documentada em `.env.example` (raiz) é lida por um schema — um
teste falha se os dois divergirem. Não repetir a lista aqui.

Regras transversais:

- cada processo chama `loadConfig(<processo>Config, process.env)` uma vez no
  startup; configuração inválida registra `config_invalid` (chaves, nunca
  valores) e encerra com código 1;
- `APP_ENV` (`development`, `test`, `staging`, `production`) é obrigatória com
  `NODE_ENV=production`; padrões locais de `DATABASE_URL`, `REDIS_URL` e
  `WEB_BASE_URL` valem só em `development`/`test`;
- com `APP_ENV=production`, `FLIGHT_PROVIDER`/`EMAIL_PROVIDER` `simulated`
  impedem o startup (kill switch até existir adapter real);
- adapter novo entra no enum de `processes.ts` e na factory do pacote
  (`createFlightProvider`, `createEmailSender`);
- `RATE_LIMIT_*` usa storage em memória, por processo — não escala sob
  múltiplas réplicas sem storage compartilhado;
- fora de `packages/config`: `AFFILIATE_TRACKING_PARAMS` (parser da SPEC-020)
  e as variáveis do `apps/web` (`WEB_BASE_URL`, `API_BASE_URL`).

### 10.3 Baseline a reconciliar com o código

As chaves abaixo são `PROPOSTO` até serem confirmadas no schema/configuração real. Não criar todas automaticamente; manter somente as necessárias. Quando uma chave daqui já existe em `.env.example`, vale a versão de lá (ex.: `FLIGHT_PROVIDER=simulated`, não `mock`; o tick é `SCHEDULER_TICK_INTERVAL_MS`).

#### Runtime e logs

| Variável              | Exemplo/default | Sensível | Observação                                        |
| --------------------- | --------------- | -------: | ------------------------------------------------- |
| `NODE_ENV`            | `development`   |      não | `development`, `test`, `production`               |
| `SERVICE_NAME`        | `api`           |      não | nome estável nos logs/traces                      |
| `APP_VERSION`         | commit SHA      |      não | preferir injeção no deploy                        |
| `LOG_LEVEL`           | `info`          |      não | `debug` proibido com payload sensível em produção |
| `SHUTDOWN_TIMEOUT_MS` | `10000`         |      não | encerramento gracioso                             |

#### PostgreSQL

| Variável                        | Exemplo            | Sensível | Observação                                     |
| ------------------------------- | ------------------ | -------: | ---------------------------------------------- |
| `DATABASE_URL`                  | `postgresql://...` |      sim | runtime Prisma                                 |
| `DIRECT_DATABASE_URL`           | `postgresql://...` |      sim | migrações/admin, somente se necessário         |
| `DATABASE_POOL_MIN`             | `2`                |      não | confirmar suporte do driver                    |
| `DATABASE_POOL_MAX`             | `10`               |      não | dimensionar por réplica                        |
| `DATABASE_STATEMENT_TIMEOUT_MS` | `5000`             |      não | consultas comuns; health usa limite mais curto |

#### Redis/BullMQ

| Variável                       | Exemplo/default | Sensível | Observação                        |
| ------------------------------ | --------------- | -------: | --------------------------------- |
| `REDIS_URL`                    | `redis://...`   |      sim | preferir URL única validada       |
| `REDIS_TLS`                    | `false` local   |      não | produção conforme provider        |
| `QUEUE_PREFIX`                 | `flight-watch`  |      não | separar ambientes                 |
| `QUEUE_DEFAULT_ATTEMPTS`       | `5`             |      não | override por classe de erro       |
| `QUEUE_BACKOFF_BASE_MS`        | `1000`          |      não | usar jitter                       |
| `QUEUE_REMOVE_COMPLETED_AFTER` | `1000`          |      não | não substituir auditoria no banco |

#### API e autenticação

| Variável                  | Exemplo/default | Sensível | Observação                        |
| ------------------------- | --------------- | -------: | --------------------------------- |
| `API_HOST`                | `0.0.0.0`       |      não | bind público no container         |
| `CORS_ALLOWED_ORIGINS`    | lista explícita |      não | wildcard proibido com credenciais |
| `JWT_SECRET`              | segredo forte   |      sim | somente se JWT for confirmado     |
| `JWT_ACCESS_TTL_SECONDS`  | `900`           |      não | confirmar modelo de sessão        |
| `JWT_REFRESH_TTL_SECONDS` | `2592000`       |      não | confirmar rotação/revogação       |
| `COOKIE_SECRET`           | segredo forte   |      sim | se cookie assinado for usado      |

#### Web

| Variável                   | Exemplo                 | Sensível | Observação                         |
| -------------------------- | ----------------------- | -------: | ---------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3000` |      não | pública por definição              |
| `NEXT_PUBLIC_APP_URL`      | `http://localhost:3001` |      não | canonical URL                      |
| `NEXT_PUBLIC_ENVIRONMENT`  | `development`           |      não | banner/telemetria, sem segredo     |
| `SERVER_API_BASE_URL`      | URL interna             |      não | somente server-side, se necessário |

#### Scheduler

| Variável                      | Exemplo/default | Sensível | Observação                                  |
| ----------------------------- | --------------- | -------: | ------------------------------------------- |
| `SCHEDULER_TICK_MS`           | `60000`         |      não | validar custo/cota                          |
| `SCHEDULER_BATCH_SIZE`        | `100`           |      não | sempre limitado                             |
| `SCHEDULER_LEASE_MS`          | `120000`        |      não | maior que execução comum, com reconciliação |
| `SCHEDULER_MAX_DELAY_MS`      | por prioridade  |      não | alimenta SLO                                |
| `PROVIDER_DAILY_CHECK_BUDGET` | pendente        |      não | obrigatório antes do provider real          |

#### Workers

| Variável                          | Exemplo/default | Sensível | Observação                       |
| --------------------------------- | --------------- | -------: | -------------------------------- |
| `PRICE_WORKER_CONCURRENCY`        | `5`             |      não | limitado pelo provider           |
| `ALERT_WORKER_CONCURRENCY`        | `5`             |      não | observar fan-out/DB              |
| `NOTIFICATION_WORKER_CONCURRENCY` | `5`             |      não | limitado pelo canal              |
| `WORKER_JOB_TIMEOUT_MS`           | por worker      |      não | classificar timeout corretamente |
| `ALERT_FANOUT_PAGE_SIZE`          | `500`           |      não | benchmark obrigatório            |
| `OUTBOX_BATCH_SIZE`               | `100`           |      não | se publisher configurável        |
| `OUTBOX_POLL_INTERVAL_MS`         | `1000`          |      não | evitar busy loop                 |

#### Provider de voos

| Variável                     | Exemplo/default   | Sensível | Estado                                             |
| ---------------------------- | ----------------- | -------: | -------------------------------------------------- |
| `FLIGHT_PROVIDER`            | `mock`            |      não | mock permitido; real BLOQUEADO                     |
| `FLIGHT_PROVIDER_BASE_URL`   | endpoint sandbox  |      não | allowlist                                          |
| `FLIGHT_PROVIDER_API_KEY`    | segredo           |      sim | nome genérico ou específico após ADR               |
| `FLIGHT_PROVIDER_TIMEOUT_MS` | `10000`           |      não | obrigatório                                        |
| `FLIGHT_PROVIDER_RATE_LIMIT` | conforme contrato |      não | nunca inventar capacidade                          |
| `DUFFEL_ACCESS_TOKEN`        | segredo           |      sim | não usar em produção antes da validação contratual |
| `DUFFEL_API_URL`             | endpoint oficial  |      não | configurar somente após integração aprovada        |

#### Notificações

| Variável               | Exemplo/default      | Sensível | Estado                  |
| ---------------------- | -------------------- | -------: | ----------------------- |
| `EMAIL_PROVIDER`       | `mock`/`smtp`        |      não | confirmar adapter atual |
| `EMAIL_FROM`           | remetente verificado |      não | obrigatório em produção |
| `SMTP_HOST`            | host                 |      não | se SMTP                 |
| `SMTP_PORT`            | `587`                |      não | se SMTP                 |
| `SMTP_USER`            | usuário              |      sim | se SMTP                 |
| `SMTP_PASSWORD`        | segredo              |      sim | se SMTP                 |
| `UNSUBSCRIBE_BASE_URL` | URL pública          |      não | token opaco e seguro    |

#### OpenTelemetry

| Variável                      | Exemplo/default            | Sensível | Observação           |
| ----------------------------- | -------------------------- | -------: | -------------------- |
| `OTEL_SERVICE_NAME`           | nome do processo           |      não | diferente por app    |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | collector                  | pode ser | não logar headers    |
| `OTEL_EXPORTER_OTLP_HEADERS`  | headers                    |      sim | secret manager       |
| `OTEL_TRACES_SAMPLER`         | `parentbased_traceidratio` |      não | custo controlado     |
| `OTEL_TRACES_SAMPLER_ARG`     | `0.1`                      |      não | ajustar por ambiente |

### 10.4 Portas locais recomendadas

Somente aplicar se não conflitar com Compose atual:

| Processo            | HTTP/app | Metrics |
| ------------------- | -------: | ------: |
| web                 |     3001 |       — |
| api                 |     3000 |    9100 |
| scheduler           |        — |    9101 |
| price-worker        |        — |    9102 |
| alert-worker        |        — |    9103 |
| notification-worker |        — |    9104 |

---

## 11. Observabilidade

### 11.1 Logging

Logs são JSON estruturado. Campos esperados:

- `timestamp`;
- `level`;
- `service`;
- `event`;
- `correlationId`;
- IDs opacos relevantes;
- duração;
- resultado;
- código de erro estável.

Campos proibidos ou redigidos: `password`, `passwordHash`, `token`, `tokenHash`, `email`, `destination`, credenciais, payload bruto e conteúdo pessoal desnecessário.

### 11.2 Métricas

- labels devem ser enumeradas e de baixa cardinalidade;
- nunca usar `userId`, `watchId`, rota, correlation ID ou mensagem de erro como label;
- incrementar efeitos de negócio depois da transação quando retries internos podem ocorrer;
- replay idempotente deve ter outcome próprio;
- métricas de processo não substituem métricas de domínio;
- `/metrics` permanece interno e isolado.

### 11.3 Health

- `/health` não revela versão, banco, hosts ou mensagens internas;
- dependência lenta possui timeout;
- health não realiza mutação;
- liveness e readiness podem ser separados se a plataforma exigir;
- provider externo não deve derrubar liveness da API de gestão.

---

## 12. Segurança e privacidade

- autorização por ownership em todo recurso do usuário;
- channel ID de outro usuário não pode revelar existência;
- secrets apenas em ambiente/secret manager;
- validação em fronteiras HTTP, fila, provider e template;
- URL externa passa por allowlist e proteção SSRF;
- nenhum HTML arbitrário do provider entra em template;
- PII não entra em métricas;
- logs usam referências opacas;
- rate limit por IP/usuário/ação sensível;
- migração destrutiva requer aprovação explícita;
- replay administrativo requer auditoria;
- dados e retenção devem seguir política LGPD aprovada antes de produção.

---

## 13. Os 12 common hurdles

### H01 — Confundir Watch com SearchTarget

**Sintoma:** uma chamada externa por usuário.  
**Causa:** modelar “passagem monitorada” como uma entidade única.  
**Solução:** Watch contém intenção/regra individual; SearchTarget contém consulta canônica compartilhada.  
**Prevenção:** constraint única no fingerprint e eval com 100 Watches → 1 target.

### H02 — Canonicalização instável

**Sintoma:** pesquisas equivalentes geram targets diferentes ou buscas distintas são misturadas.  
**Causa:** casing, defaults, ordem ou campos omitidos.  
**Solução:** função pura, versionada, campos persistidos e SHA-256 da chave canônica.  
**Prevenção:** property tests de equivalência/diferença e verificação de colisão pelos campos.

### H03 — Dinheiro em ponto flutuante

**Sintoma:** diferenças de centavos e alertas no limite errado.  
**Causa:** `number` decimal sem regra.  
**Solução:** inteiro em unidade mínima + moeda; cálculo percentual com decimal exato.  
**Prevenção:** testes de borda, arredondamento somente na apresentação.

### H04 — Tratar no-offers como preço zero

**Sintoma:** gráfico cai para zero e alerta falso.  
**Causa:** ausência de oferta representada como observação.  
**Solução:** `SearchExecution=no_offers`, sem nova PriceObservation; preservar último preço.  
**Prevenção:** eval e UI distinta para ausência, falha e dado desatualizado.

### H05 — Duplicação por entrega at-least-once

**Sintoma:** observação, alerta ou e-mail duplicado.  
**Causa:** retry após timeout/ack ambíguo.  
**Solução:** idempotency key persistente + constraint única + consumidor idempotente.  
**Prevenção:** processar o mesmo job três vezes nos testes.

### H06 — Dual-write banco + fila

**Sintoma:** dado confirmado sem job, ou job sem dado.  
**Causa:** commit e publish separados.  
**Solução:** outbox na mesma transação e publisher reconciliável.  
**Prevenção:** teste de falha após publicação antes do mark-as-published.

### H07 — Corrida entre schedulers

**Sintoma:** duas execuções para target/janela.  
**Causa:** múltiplas réplicas selecionam o mesmo registro.  
**Solução:** `SKIP LOCKED`/lease expirada + chave idempotente da janela.  
**Prevenção:** teste concorrente com duas ou mais instâncias.

### H08 — Rate limit e retry amplificando falha

**Sintoma:** avalanche de 429 e backlog crescente.  
**Causa:** retry imediato e local por worker.  
**Solução:** limiter global por provider, `Retry-After`, backoff com jitter e circuit breaker.  
**Prevenção:** eval 429/timeout e orçamento de chamadas.

### H09 — Fan-out de alerta causando N+1

**Sintoma:** um target popular degrada banco/memória.  
**Causa:** buscar referência/regra individual dentro do loop.  
**Solução:** paginação, queries em lote, checkpoint idempotente e índices.  
**Prevenção:** benchmark de 100 mil Watches ligados a um target.

### H10 — Métrica contada dentro de transação retentável

**Sintoma:** contador maior que efeitos persistidos.  
**Causa:** incremento antes de retry/commit.  
**Solução:** transação retorna outcome; métrica é registrada depois do resultado final.  
**Prevenção:** teste com retry de constraint/deadlock e valor exato da métrica.

### H11 — Métricas expostas publicamente ou com alta cardinalidade

**Sintoma:** vazamento operacional, memória crescente ou Prometheus caro.  
**Causa:** `/metrics` na API pública ou IDs em labels.  
**Solução:** listener dedicado em loopback/rede interna e labels enumeradas.  
**Prevenção:** `curl` público retorna 404; auditoria de label names.

### H12 — Drift entre código, spec e ambiente

**Sintoma:** Claude implementa requisito antigo; `.env.example` incompleto; call site esquecido após mudança de retorno.  
**Causa:** documentação ou contratos atualizados isoladamente.  
**Solução:** mudança vertical completa: spec → contrato → código → testes → env/docs.  
**Prevenção:** typecheck de todos os packages, busca global de call sites e checklist pós-implementação.

---

## 14. Os 14 design patterns do projeto

### P01 — Modular Monolith

Módulos lógicos no mesmo repositório e banco; processos escaláveis separadamente. Extração de microserviço apenas com gargalo comprovado e ADR.

### P02 — Ports and Adapters

Domínio define portas; providers, notificações, banco e filas são adaptadores. SDK externo nunca contamina domínio.

### P03 — Repository

Persistência encapsulada por repositories orientados ao caso de uso. Não expor Prisma indiscriminadamente entre módulos.

### P04 — Application Service / Use Case

Cada ação relevante possui serviço de aplicação com input, autorização, transação e resultado tipados.

### P05 — Strategy

Seleção de provider, frequência, prioridade, referência e política de melhor oferta são estratégias versionáveis.

### P06 — Canonical Key + Fingerprint

Normalização semântica produz chave versionada; hash fornece busca/unicidade, campos persistidos permitem auditoria.

### P07 — Transactional Outbox

Estado e intenção de publicação são confirmados juntos; publicação é eventual e reconciliável.

### P08 — Idempotent Consumer

Todo consumidor de fila pode receber a mesma mensagem novamente sem duplicar efeito externo ou persistente.

### P09 — Job Envelope Versionado

Jobs carregam schema version, idempotency key, correlation ID, tempo e payload mínimo.

### P10 — Retry + Exponential Backoff + Jitter

Somente falhas temporárias; limites definidos; respeitar `Retry-After`; falha permanente vai para estado terminal.

### P11 — Circuit Breaker + Bulkhead

Falha de provider/canal não deve consumir indefinidamente workers nem derrubar a API de gestão.

### P12 — Lease / Optimistic Concurrency

Scheduler e workers coordenam concorrência sem lock global; lease expira e é reconciliada; agregados mutáveis usam versão quando necessário.

### P13 — Append-only Observation

PriceObservation é imutável. Correção é novo fato/anotação, não edição silenciosa do histórico.

### P14 — State Machine + Result Taxonomy

Watch, SearchExecution, AlertEvent e NotificationDelivery têm transições explícitas. Erros/outputs usam taxonomia estável, evitando booleanos ambíguos.

---

## 15. Processo Spec Driven + Eval Driven + TDD

### 15.1 Antes do código

1. localizar ou criar `SPEC-NNN`;
2. declarar objetivo e fora de escopo;
3. definir atores, entradas, outputs e estados;
4. listar invariantes;
5. definir contrato HTTP/evento/job;
6. definir falhas e retries;
7. definir observabilidade;
8. criar critérios de aceitação;
9. criar/selecionar evals;
10. definir rollout e rollback.

### 15.2 Durante a implementação

1. escrever/alterar teste que falha pelo motivo esperado;
2. implementar o menor comportamento correto;
3. rodar gate local do package afetado;
4. integrar verticalmente;
5. rodar testes de integração e evals;
6. verificar concorrência, idempotência e dados sensíveis;
7. inspecionar diff completo.

### 15.3 Depois

- atualizar spec se a decisão aprovada mudou;
- ADR para decisão arquitetural significativa;
- regression test para bug;
- runbook para novo modo de falha;
- atualizar env e este arquivo;
- registrar comandos e gates reais, nunca presumidos.

### 15.4 Template mínimo de nova spec

```markdown
# SPEC-NNN — Título

Status: draft | approved | implemented | deprecated
Owner:
Dependencies:

## Objective

## Non-goals

## Actors and authorization

## Inputs and validation

## Domain behavior and invariants

## API/event/job contract

## Persistence and migrations

## Idempotency and concurrency

## Failure modes and retries

## Security and privacy

## Observability

## Performance and cost budget

## Acceptance criteria

## Tests and evals

## Rollout, rollback and kill switch

## Open questions

## Implementation evidence
```

Uma spec evolui por versão e status. Não reescrever silenciosamente comportamento já publicado; registrar compatibilidade/migração.

---

## 16. Pipeline de runtime

O monitoramento é contínuo; não deve depender do pipeline semanal humano.

| Frequência                    | Processo                      | Regra                                          |
| ----------------------------- | ----------------------------- | ---------------------------------------------- |
| contínuo                      | API/web                       | gestão do usuário                              |
| configurável, baseline 60 s   | scheduler tick                | selecionar lote elegível sem exceder orçamento |
| contínuo                      | price-worker                  | limitado por provider e fila                   |
| contínuo                      | alert-worker                  | fan-out paginado e idempotente                 |
| contínuo                      | notification-worker           | rate limit por canal                           |
| configurável, poucos segundos | outbox publisher              | publicar lotes confirmados                     |
| a cada 30–60 s                | platform probes               | health/readiness                               |
| contínuo                      | metrics/logs/traces           | observabilidade                                |
| diário, janela de baixa carga | retenção/reconciliação pesada | somente após spec/runbook                      |

Não adicionar cron destrutivo sem spec, dry-run, limite de lote, métrica e rollback.

---

## 17. Pipeline semanal de engenharia

Horários abaixo são uma cadência recomendada em `America/Campo_Grande`. Ajustes são permitidos, mas quality gates não são opcionais.

### Segunda-feira — decisão e especificação

| Horário     | Atividade                                             | Saída              |
| ----------- | ----------------------------------------------------- | ------------------ |
| 08:00–08:30 | saúde da produção/staging, filas, custos e incidentes | status operacional |
| 08:30–09:30 | triagem de bugs, dependências e bloqueios externos    | prioridades        |
| 09:30–11:00 | revisar roadmap e selecionar menor fatia vertical     | objetivo semanal   |
| 11:00–12:00 | atualizar/criar spec e ADR necessário                 | draft rastreável   |
| 13:30–15:00 | definir acceptance tests, evals e orçamento           | plano verificável  |
| 15:00–16:00 | threat/privacy review da mudança                      | riscos/mitigações  |
| 16:00–17:30 | testes iniciais e preparação de fixtures              | red phase          |
| 17:30–18:00 | revisão do escopo e handoff                           | tarefa pronta      |

### Terça-feira — implementação vertical

| Horário     | Atividade                              | Saída               |
| ----------- | -------------------------------------- | ------------------- |
| 08:00–08:20 | atualizar branch e checar working tree | base segura         |
| 08:20–10:30 | domínio/contratos/testes               | núcleo tipado       |
| 10:30–12:00 | persistência/migração/outbox           | integração de dados |
| 13:30–15:30 | app/worker/API                         | caminho funcional   |
| 15:30–16:30 | observabilidade e erros                | operação visível    |
| 16:30–17:30 | testes do package e revisão do diff    | gate local          |
| 17:30–18:00 | registrar pendências reais             | continuidade        |

### Quarta-feira — integração, UX e resiliência

| Horário     | Atividade                          | Saída                |
| ----------- | ---------------------------------- | -------------------- |
| 08:00–10:00 | integração PostgreSQL/Redis/fila   | fluxo integrado      |
| 10:00–11:30 | concorrência, retry e idempotência | cenários críticos    |
| 11:30–12:00 | custo/rate limit/backpressure      | orçamento verificado |
| 13:30–15:30 | front-end/UX ou consumidor afetado | jornada completa     |
| 15:30–16:30 | responsividade/acessibilidade      | UI validada          |
| 16:30–18:00 | E2E principal e correções          | happy/unhappy paths  |

### Quinta-feira — quality gates e review

| Horário     | Atividade                          | Saída                 |
| ----------- | ---------------------------------- | --------------------- |
| 08:00–09:00 | formatter, lint e typecheck global | gates estáticos       |
| 09:00–11:00 | unitários, integração e evals      | correção funcional    |
| 11:00–12:00 | build, migrations e smoke local    | artefato verificável  |
| 13:30–14:30 | security/dependency/secret scan    | risco avaliado        |
| 14:30–16:00 | code review independente           | findings priorizados  |
| 16:00–17:30 | correções do review                | diff final            |
| 17:30–18:00 | atualizar docs/spec/ADR            | contexto sincronizado |

### Sexta-feira — staging, release e aprendizagem

| Horário     | Atividade                                  | Saída                    |
| ----------- | ------------------------------------------ | ------------------------ |
| 08:00–09:00 | confirmar commit exato e release checklist | release candidate        |
| 09:00–10:30 | deploy em staging + migração segura        | ambiente validado        |
| 10:30–12:00 | E2E/smoke, métricas e logs                 | evidência de staging     |
| 13:30–14:30 | canário/produção quando aprovado           | rollout controlado       |
| 14:30–15:30 | monitorar SLO, erro, fila e custo          | decisão ampliar/pausar   |
| 15:30–16:30 | rollback/roll-forward se necessário        | estabilidade             |
| 16:30–17:15 | retro técnica e novos evals                | aprendizagem incorporada |
| 17:15–18:00 | atualizar roadmap e status deste arquivo   | contexto vivo            |

### Sábado e domingo

- sem releases rotineiros;
- monitoramento automatizado continua;
- somente incidentes ou manutenção previamente aprovada;
- qualquer intervenção manual deve deixar auditoria e postmortem proporcional.

---

## 18. Quality gates

Ordem mínima:

1. escopo/spec rastreável;
2. formatter;
3. lint;
4. typecheck estrito;
5. unit tests;
6. integration tests com dependências reais quando aplicável;
7. domain evals;
8. authorization/security tests;
9. migration validation;
10. performance/cost regression;
11. build;
12. E2E crítico;
13. observabilidade/runbook;
14. staging/smoke para release.

Não desativar gate, remover asserção ou enfraquecer teste para obter verde. Exceção exige risco, owner, mitigação, prazo e aprovação humana.

### 18.1 Comandos

Descobrir scripts reais no `package.json`; não inventar. Baseline esperada:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

Para pacote afetado, usar filtros sem deixar de rodar o gate global antes de concluir.

---

## 19. Checklist pós-implementação

### Escopo e comportamento

- [ ] A spec correta foi atendida.
- [ ] Fora de escopo não foi implementado silenciosamente.
- [ ] Critérios de aceitação estão mapeados para testes.
- [ ] Invariantes do domínio permanecem válidas.
- [ ] Estados de erro, vazio, loading e replay foram tratados.

### Código e arquitetura

- [ ] Fronteiras de módulos foram respeitadas.
- [ ] Não há import profundo ou acoplamento de SDK ao domínio.
- [ ] Componentes/serviços existentes foram reutilizados quando apropriado.
- [ ] Nenhuma abstração prematura foi criada.
- [ ] Dependência nova possui justificativa, licença e impacto avaliados.
- [ ] Todos os call sites de contrato alterado foram localizados.

### Dados e migração

- [ ] Migração é expansiva/compatível ou possui plano explícito.
- [ ] Migração publicada não foi editada.
- [ ] Constraints e índices críticos existem.
- [ ] Backfill é limitado, reiniciável e observável.
- [ ] Rollback ou roll-forward está documentado.
- [ ] Retenção e exclusão não corrompem auditoria.

### Assíncrono e concorrência

- [ ] Job/evento possui schema version e idempotency key.
- [ ] Redelivery não duplica efeito.
- [ ] Retry ocorre apenas para falha temporária.
- [ ] Backoff/jitter e máximo de tentativas estão definidos.
- [ ] Lock/lease expira e é reconciliável.
- [ ] Outbox foi usada quando há dual-write.
- [ ] Dead-letter/replay foi considerado.

### Provider e custo

- [ ] Timeout existe em toda chamada externa.
- [ ] Rate limit é global e respeita `Retry-After`.
- [ ] Custo/cota é mensurável.
- [ ] Circuit breaker/bulkhead é adequado.
- [ ] Payload externo é validado e sanitizado.
- [ ] Termos contratuais permitem o comportamento.

### Segurança e privacidade

- [ ] Autorização por ownership testada.
- [ ] Segredos não aparecem no diff/log/fixture.
- [ ] PII não virou label de métrica.
- [ ] URL/template/entrada externa foi tratada.
- [ ] Rate limit público foi preservado.
- [ ] Auditoria existe para ação administrativa sensível.

### Observabilidade

- [ ] Logs possuem evento e correlation ID.
- [ ] Logs redigem campos proibidos.
- [ ] Métricas têm labels limitadas.
- [ ] Métrica de negócio é registrada depois do efeito final quando necessário.
- [ ] Health não expõe detalhes internos.
- [ ] Novo modo de falha possui alerta/runbook.
- [ ] Shutdown gracioso foi testado.

### Front-end

- [ ] `docs/DESIGN-SYSTEM.md` foi respeitado.
- [ ] Desktop e mobile foram verificados.
- [ ] Navegação por teclado e foco visível funcionam.
- [ ] Contraste e semântica são adequados.
- [ ] Erro, no-offers e dado stale são distintos.
- [ ] Preço não é apresentado como garantia de mercado.
- [ ] Console do browser não possui erro relevante.

### Gates e entrega

- [ ] Formatter passou.
- [ ] Lint passou.
- [ ] Typecheck passou em todos os packages.
- [ ] Unitários passaram.
- [ ] Integração/evals passaram.
- [ ] Build passou.
- [ ] E2E crítico passou quando aplicável.
- [ ] Diff final foi revisado.
- [ ] Working tree foi inspecionada sem apagar trabalho alheio.
- [ ] Rollout, kill switch e rollback estão claros.

### Documentação viva

- [ ] Spec contém evidência de implementação.
- [ ] ADR foi criado/atualizado se necessário.
- [ ] `.env.example` e tabela de env estão sincronizados.
- [ ] Estrutura de apps/packages está atualizada.
- [ ] Novo hurdle ou pattern foi documentado quando recorrente.
- [ ] Este `CLAUDE.md` continua factual e sem duplicação desnecessária.

---

## 20. Fluxo obrigatório do Claude

### 20.1 Antes de editar

1. executar `git status --short`;
2. identificar staged, unstaged e untracked;
3. ler `CLAUDE.md`, `AGENTS.md`, spec, `DOMAIN.md` e ADRs relevantes;
4. localizar código e testes existentes com `rg`;
5. inspecionar scripts e versões reais;
6. resumir objetivo, riscos, arquivos permitidos e gates;
7. pedir decisão somente se houver bloqueio material.

### 20.2 Durante

- aplicar TDD quando a mudança for comportamental;
- manter mudanças pequenas e rastreáveis;
- preservar trabalho do usuário;
- não editar arquivo não relacionado;
- usar funções puras no domínio;
- registrar decisões importantes em docs;
- verificar frequentemente o diff.

### 20.3 Ao concluir

Informar:

- spec atendida;
- comportamento implementado;
- arquivos alterados;
- testes/comandos executados e resultados reais;
- gates não executados e motivo;
- migração/rollout/rollback;
- riscos e pendências;
- documentação atualizada.

Nunca alegar execução que não ocorreu.

---

## 21. Autonomia progressiva

| Nível | Claude pode                                                  |
| ----- | ------------------------------------------------------------ |
| 0     | analisar e explicar                                          |
| 1     | propor plano/diff                                            |
| 2     | alterar testes e docs aprovados                              |
| 3     | implementar spec isolada em branch                           |
| 4     | alterar múltiplos módulos dentro de spec aprovada            |
| 5     | abrir PR e corrigir CI, sem merge                            |
| 6     | corrigir automaticamente falhas classificadas de baixo risco |

Sempre requer aprovação humana explícita:

- produção;
- merge;
- migração destrutiva;
- secrets;
- billing;
- mudança de autenticação/autorização;
- provider real;
- alteração de política de privacidade/retenção;
- exclusão de dados;
- mudança contratual.

Autonomia aumenta por desempenho medido em evals e regressões, não por confiança subjetiva.

---

## 22. Ações proibidas

- inventar requisito, endpoint, variável ou estado como se existisse;
- iniciar provider real enquanto o bloqueio contratual permanecer;
- colocar `/metrics` na porta pública;
- logar segredo, e-mail completo ou payload bruto;
- usar float para dinheiro;
- representar no-offers como zero;
- criar uma consulta por Watch quando SearchTarget é compartilhável;
- enviar notificação sem chave idempotente;
- publicar evento fora da estratégia de consistência aprovada;
- editar migração já aplicada;
- fazer retry infinito;
- capturar erro e reportar sucesso;
- desabilitar teste/gate para concluir;
- executar refatoração ampla não solicitada junto de feature;
- usar LLM para regra determinística de alerta;
- apagar ou sobrescrever trabalho local não relacionado;
- declarar “pronto” com gate obrigatório falhando.

---

## 23. Roadmap técnico imediato

1. manter integração real de provider bloqueada até resposta/validação da Duffel;
2. consolidar review independente da fase de observabilidade;
3. confirmar que todas as mudanças reportadas estão commitadas e rastreáveis;
4. reconciliar esta tabela de env com `packages/config` e `.env.example` reais;
5. verificar implementação real do web e consolidar `docs/DESIGN-SYSTEM.md`;
6. manter provider mock para E2E e desenvolvimento;
7. preparar spike contratual/técnico do provider real após liberação;
8. medir custo, deduplicação e intervalo antes de prometer frequência comercial.

---

## 24. Definition of Done

Uma tarefa só está concluída quando:

- a spec e os critérios estão claros;
- implementação e testes concordam;
- invariantes e contratos foram preservados;
- gates aplicáveis passaram;
- segurança, idempotência, custo e observabilidade foram avaliados;
- documentação viva foi atualizada;
- rollout/rollback estão definidos;
- o relatório final é verificável;
- nenhuma pendência crítica foi ocultada.
