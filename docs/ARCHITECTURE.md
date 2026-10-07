# ARCHITECTURE — Flight Watch

Versão: 0.1  
Status: proposta para validação

## 1. Princípios

1. Começar como monólito modular, com processos separáveis.
2. Escalar workers horizontalmente antes de separar serviços.
3. Tratar APIs externas como recursos limitados e falíveis.
4. Compartilhar pesquisas equivalentes.
5. Assumir entrega de jobs ao menos uma vez e tornar efeitos idempotentes.
6. Manter PostgreSQL como fonte de verdade; Redis não guarda estado irrecuperável.
7. Medir custo, atraso e qualidade como requisitos funcionais.
8. Evitar inteligência artificial em decisões determinísticas do núcleo.

## 2. Stack baseline

| Camada     | Tecnologia proposta         | Observação                                    |
| ---------- | --------------------------- | --------------------------------------------- |
| Monorepo   | pnpm workspaces + Turborepo | build e tarefas por pacote                    |
| Frontend   | Next.js + TypeScript        | App Router, UI e BFF apenas quando necessário |
| API        | NestJS + REST               | contrato OpenAPI                              |
| Validação  | Zod                         | esquemas compartilhados de fronteira          |
| Banco      | PostgreSQL                  | fonte de verdade                              |
| ORM        | Prisma                      | baseline; confirmar em spike                  |
| Cache/fila | Redis + BullMQ              | jobs, rate limit e cache descartável          |
| Unitários  | Vitest                      | domínio e serviços                            |
| Integração | Vitest + Testcontainers     | PostgreSQL e Redis reais                      |
| E2E        | Playwright                  | jornadas críticas                             |
| Telemetria | OpenTelemetry               | traces, métricas e correlação                 |
| Logs       | JSON estruturado            | sem dados sensíveis                           |
| Containers | Docker                      | paridade local/CI                             |
| CI/CD      | GitHub Actions              | gates obrigatórios                            |

Tecnologias são baseline, não autorização para adicionar dependências sem necessidade documentada.

## 3. Estrutura do repositório

```text
flight-watch/
├── AGENTS.md
├── README.md
├── apps/
│   ├── web/
│   ├── api/
│   ├── scheduler/
│   ├── price-worker/
│   └── notification-worker/
├── packages/
│   ├── domain/
│   ├── contracts/
│   ├── database/
│   ├── queue/
│   ├── providers/
│   ├── notifications/
│   ├── observability/
│   ├── config/
│   └── testing/
├── docs/
│   ├── specs/
│   ├── adr/
│   └── runbooks/
├── evals/
│   ├── fixtures/
│   ├── scenarios/
│   └── runner/
└── tests/
    ├── integration/
    ├── e2e/
    └── performance/
```

## 4. Componentes de execução

| Processo            | Responsabilidade                              |  Escala independente |
| ------------------- | --------------------------------------------- | -------------------: |
| Web                 | interface e renderização                      |                  sim |
| API                 | autenticação, CRUD e leitura                  |                  sim |
| Scheduler           | encontra targets elegíveis e enfileira checks | sim, com coordenação |
| Price Worker        | consulta provedor e persiste resultado        |                  sim |
| Notification Worker | entrega alertas                               |                  sim |
| Outbox Publisher    | publica eventos confirmados                   |                  sim |

Na primeira implantação, scheduler e outbox publisher podem compartilhar um processo, mas permanecem módulos distintos.

## 5. Fluxo principal

### 5.1 Criação de Watch

1. API autentica e aplica rate limit.
2. DTO é validado e normalizado.
3. Serviço calcula a chave canônica.
4. Transação cria ou reutiliza SearchTarget.
5. Transação cria Watch e AlertRules.
6. Evento de outbox é persistido.
7. Resposta `201` retorna Watch e estado inicial.
8. Publisher agenda verificação antecipada quando o target ainda não possui observação recente.

### 5.2 Verificação de preço

1. Scheduler seleciona targets com `next_check_at <= now`.
2. Obtém lease curta e cria job com chave idempotente.
3. Worker verifica quota/circuit breaker.
4. Adaptador do provedor realiza a consulta.
5. Resposta é validada e normalizada.
6. SearchExecution e PriceObservation são persistidos.
7. `next_check_at` é recalculado.
8. Evento `PriceObserved` é publicado pela outbox.
9. Alert Engine avalia Watches ativos vinculados.

### 5.3 Notificação

1. Regra atendida cria AlertEvent com chave única.
2. Cooldown e canal verificado são avaliados.
3. `NotificationRequested` entra na outbox.
4. Worker envia com chave idempotente.
5. Resultado é persistido e retry ocorre apenas para falhas classificadas como temporárias.

## 6. Banco de dados

Tabelas iniciais:

- `users`
- `notification_channels`
- `watches`
- `alert_rules`
- `search_targets`
- `search_executions`
- `price_observations`
- `providers`
- `provider_quotas`
- `alert_events`
- `notification_deliveries`
- `outbox_events`
- `audit_events`

Índices críticos:

- `search_targets(fingerprint)` único;
- `search_targets(status, next_check_at)` parcial para ativos;
- `watches(user_id, status)`;
- `watches(search_target_id, status)`;
- `price_observations(search_target_id, observed_at desc)`;
- `alert_events(deduplication_key)` único;
- `notification_deliveries(idempotency_key)` único;
- `outbox_events(status, available_at)`.

`price_observations` deve ser candidata a particionamento temporal somente quando volume e planos de consulta justificarem. Particionamento não faz parte do bootstrap.

## 7. Filas e jobs

Filas iniciais:

- `price-check`;
- `price-observed` ou consumidor equivalente via outbox;
- `notification`;
- `dead-letter` por tipo lógico.

Contrato mínimo de job:

```json
{
  "schemaVersion": 1,
  "jobId": "opaque-id",
  "idempotencyKey": "opaque-key",
  "correlationId": "opaque-id",
  "entityId": "uuid",
  "requestedAt": "RFC3339"
}
```

Jobs não transportam credenciais, payload completo do provedor ou dados pessoais desnecessários.

## 8. Agendamento adaptativo

O intervalo considera:

- dias até a partida;
- plano/prioridade do Watch;
- quantidade de Watches compartilhando o target;
- idade da última observação válida;
- volatilidade medida, quando houver dados suficientes;
- saúde, cota e custo do provedor;
- backlog atual.

Regras iniciais serão configuráveis e avaliadas por custo versus frescor. O scheduler não promete periodicidade exata; promete processar dentro de uma janela/SLO por classe.

## 9. Resiliência

- timeout em toda chamada externa;
- retries exponenciais com jitter apenas para erros temporários;
- respeito a `Retry-After`;
- rate limiter global por provedor e endpoint;
- circuit breaker para falhas persistentes;
- bulkhead lógico por integração;
- dead-letter com replay controlado;
- lease expirada reconciliada automaticamente;
- shutdown gracioso;
- nenhuma falha externa apaga dados válidos existentes.

Retry não deve multiplicar requisições inseguras. A classificação de erro pertence ao adaptador.

## 10. Cache

Redis pode guardar:

- resposta curta para evitar consultas simultâneas equivalentes;
- locks/leases com expiração;
- contadores de rate limit;
- resultados derivados reconstruíveis;
- estado transitório de filas.

Redis não é fonte exclusiva de Watches, observações, alertas ou entregas. Perda total do Redis deve causar atraso recuperável, não perda permanente de domínio.

## 11. Segurança e LGPD

- autenticação segura e sessões/tokens com expiração;
- autorização por proprietário em toda operação de Watch;
- criptografia em trânsito e em repouso conforme a plataforma;
- segredos somente em gerenciador de segredos/variáveis protegidas;
- mascaramento de contato e proibição de PII em logs;
- rate limiting por IP, usuário e ação sensível;
- trilha de auditoria para alterações relevantes;
- validação estrita de URLs externas e prevenção de SSRF;
- dependências e imagens verificadas no CI;
- política de eliminação, exportação e retenção a definir antes de produção;
- revisão dos contratos e bases legais aplicáveis antes de coletar dados reais.

## 12. Observabilidade

### Métricas mínimas

- targets elegíveis e atrasados;
- latência e resultado por provedor;
- chamadas, cota e custo estimado;
- tamanho e idade da fila;
- taxa de deduplicação;
- observações válidas/sem ofertas/inválidas;
- AlertEvents criados/suprimidos;
- notificações entregues/falhas;
- retries e dead letters;
- SLO por classe de prioridade.

### Correlação

`correlation_id` acompanha request, outbox, job, execução, alerta e entrega. IDs de usuário e contatos não devem ser usados como rótulos de métrica de alta cardinalidade.

## 13. SLOs propostos para piloto

| Indicador                                         | Meta inicial |
| ------------------------------------------------- | -----------: |
| Disponibilidade da API de gestão                  | 99,5% mensal |
| Watches elegíveis processados na janela prometida |          95% |
| AlertEvent persistido após observação válida      | p95 até 60 s |
| Notificação enfileirada após AlertEvent           | p95 até 30 s |
| Duplicação conhecida por idempotency key          |            0 |

SLO de busca depende da cota do provedor e deve ser recalibrado no piloto.

## 14. Escalabilidade

Ordem recomendada:

1. medir e corrigir consultas/índices;
2. ampliar workers concorrentes dentro da cota;
3. separar pools de API, scheduler e workers;
4. adicionar réplicas de leitura para consultas históricas;
5. particionar observações se necessário;
6. separar um módulo em serviço apenas diante de gargalo, equipe ou isolamento comprovado.

Mais servidores não resolvem limite de API. Deduplicação, frequência adaptativa e contrato comercial são os principais controles de capacidade.

## 15. Ambientes e entrega

- `local`: containers e provedores simulados;
- `test`: execução efêmera em CI;
- `staging`: configuração próxima à produção, contatos seguros e cota limitada;
- `production`: credenciais e dados segregados.

Migrações seguem expansão/contração. Deploy não deve depender de alterar uma coluna incompatível e o código simultaneamente. Rollback de aplicação deve continuar compatível com a etapa de expansão.

## 16. Capacidade — modelo a preencher

```text
unique_targets = active_watches / average_watches_per_target
checks_per_day = sum(unique_targets_by_class * checks_per_day_by_class)
monthly_provider_cost = checks_per_day * 30 * cost_per_check
```

Antes do lançamento, o teste de capacidade deve usar valores reais de cota, custo, latência e taxa de deduplicação do piloto.
