# Flight Watch

Plataforma de monitoramento de preços de passagens aéreas. A pessoa cadastra uma
viagem e uma regra de alerta; o sistema consulta provedores autorizados, guarda o
histórico de preços observados e avisa quando a regra é atendida. Também oferece
busca de voos, um feed público de oportunidades e um mapa de promoções.

> **Status:** pré-lançamento. O fluxo completo roda de ponta a ponta, mas com
> **provedor de voos e envio de e-mail simulados**. Integração com provedor real
> e e-mail transacional estão no roteiro de lançamento.

## Arquitetura em uma tela

Monólito modular em TypeScript, com processos que escalam separadamente:

```text
web (Next.js) ──► api (NestJS + Fastify) ──► PostgreSQL (fonte de verdade + outbox)
                                         └─► Redis/BullMQ (filas, locks, rate limit)
                                                   │
         scheduler ──► price-worker ──► alert-worker ──► notification-worker
```

Decisões estruturantes: `Watch` (intenção individual) separado de `SearchTarget`
(consulta compartilhada entre usuários), outbox transacional, consumidores
idempotentes, `PriceObservation` imutável e dinheiro sempre em inteiro na menor
unidade da moeda. Detalhes em
[`ARCHITECTURE.md`](./docs/ARCHITECTURE.md) e nos
[ADRs](./docs/adr/).

## Estrutura do repositório

```text
apps/
  web/                  Next.js (App Router) — interface e BFF de sessão
  api/                  NestJS + Fastify — HTTP público, auth, watches, busca
  scheduler/            seleciona SearchTargets elegíveis e enfileira checagens
  price-worker/         consulta o provedor, normaliza e grava observações
  alert-worker/         avalia regras de alerta (fan-out paginado)
  notification-worker/  renderiza e entrega notificações
packages/
  domain/               regras puras, sem framework, banco ou fila
  contracts/            schemas Zod, DTOs e envelopes de jobs/eventos
  database/             Prisma, repositórios, migrações e outbox
  queue/                filas BullMQ e publicador da outbox
  providers/            porta de provedor de voos, adapter simulado, resiliência
  notifications/        porta de e-mail, templates e adapter simulado
  observability/        logger JSON, métricas Prometheus e servidor interno
docs/                   produto, domínio, arquitetura, ADRs, specs e roadmap
                        (índice em docs/README.md)
scripts/design/         checagens automáticas do design system
AGENTS.md / CLAUDE.md   regras para agentes de IA neste repositório
```

## Requisitos

- Node.js 24 (LTS) — versão em [`.nvmrc`](./.nvmrc)
- pnpm 10 — habilite com `corepack enable` (a versão vem de `packageManager`)
- Docker — PostgreSQL e Redis locais e testes com Testcontainers

## Rodando localmente

```bash
pnpm install
docker compose up -d                       # PostgreSQL 16 + Redis 7

cp packages/database/.env.example packages/database/.env
pnpm --filter @flight-watch/database prisma:deploy   # aplica as migrações
pnpm --filter @flight-watch/database prisma:seed     # conta de dev (opcional)
pnpm build
```

Em desenvolvimento nenhuma variável é obrigatória: banco, Redis e URL do web já
apontam para o `docker compose` local. Suba os processos em terminais separados:

```bash
pnpm --filter @flight-watch/api start:dev
pnpm --filter @flight-watch/scheduler start:dev
pnpm --filter @flight-watch/price-worker start:dev
pnpm --filter @flight-watch/alert-worker start:dev
pnpm --filter @flight-watch/notification-worker start:dev
pnpm --filter @flight-watch/web dev
```

| Processo            | Porta HTTP | Métricas (somente 127.0.0.1) |
| ------------------- | ---------: | ---------------------------: |
| web                 |       3100 |                            — |
| api                 |       3000 |                         9100 |
| scheduler           |          — |                         9101 |
| price-worker        |          — |                         9102 |
| alert-worker        |          — |                         9103 |
| notification-worker |          — |                         9104 |

A conta criada pelo seed é só para desenvolvimento; credenciais em
[`packages/database/prisma/seed.ts`](./packages/database/prisma/seed.ts).

### Stack completa com Docker

Para testar como em staging (imagens de produção, `APP_ENV=staging`):

```bash
docker compose --profile stack up --build   # web em http://127.0.0.1:3100
```

O [`Dockerfile`](./Dockerfile) tem um target por processo (`api`, `scheduler`,
`price-worker`, `alert-worker`, `notification-worker`, `web`) e um `migrate`,
que aplica as migrações e sai — rode-o antes de subir uma versão nova
(SPEC-028).

### Configuração

Todas as variáveis estão documentadas em [`.env.example`](./.env.example) e são
validadas no startup por [`packages/config`](./packages/config/src/processes.ts)
(SPEC-024): valor inválido impede o processo de subir, com uma mensagem por
chave. Em produção (`APP_ENV=production`), provedor de voos ou e-mail
`simulated` também impede o startup.

## Quality gates

Os mesmos comandos rodam na CI ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml))
e bloqueiam o merge:

```bash
pnpm format:check   # G1
pnpm lint           # G1
pnpm typecheck      # G2
pnpm test           # G3/G4 — inclui integração com PostgreSQL/Redis reais
pnpm check:design   # design system: contraste, tokens, aviso de comissão
pnpm build          # G9
```

A definição completa de cada gate está em
[`QUALITY-GATES.md`](./docs/QUALITY-GATES.md).

## Como contribuir

1. Crie uma branch a partir de `main` (`feat/…`, `fix/…`, `chore/…`, `docs/…`).
2. Mudança de comportamento começa pela spec em
   [`docs/specs/`](./docs/specs/) e por um teste
   que falha.
3. Commits seguem [Conventional Commits](https://www.conventionalcommits.org/)
   com mensagem em português.
4. Abra um PR para `main` com os gates verdes e preencha o template.

Ordem de leitura para entender o projeto: `PRODUCT.md` → `DOMAIN.md` →
`ARCHITECTURE.md` → ADRs → `QUALITY-GATES.md` → spec da feature. Agentes de IA
seguem também [`CLAUDE.md`](./CLAUDE.md) e
[`AGENTS.md`](./AGENTS.md).
