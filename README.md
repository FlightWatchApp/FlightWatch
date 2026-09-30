# Flight Watch

Implementação do sistema descrito em [`flight-watch-foundation-v0.1/`](./flight-watch-foundation-v0.1/). Leia aquele pacote antes de contribuir — `README.md` → `PRODUCT.md` → `DOMAIN.md` → `ARCHITECTURE.md` → `docs/adr/` → `EVALS.md` → `QUALITY-GATES.md` → `AGENTS.md` → `docs/specs/`.

Agentes de IA trabalhando neste repositório seguem as regras de [`flight-watch-foundation-v0.1/AGENTS.md`](./flight-watch-foundation-v0.1/AGENTS.md).

## Estrutura

```text
apps/           processos implantáveis (web, api, scheduler, price-worker, notification-worker)
packages/       código compartilhado (domain, contracts, database, queue, providers, notifications, ...)
evals/          cenários de avaliação determinística (EVALS.md)
tests/          integração, e2e e performance cross-app
```

`apps/*` e a maioria de `packages/*` ainda não existem — são criados spec a spec, conforme a fase correspondente é implementada. `packages/domain` é o primeiro a existir: contém as regras puras do domínio, sem dependência de framework, banco ou fila (DR-017 do DOMAIN.md).

## Requisitos

- Node.js >= 20
- pnpm (via `corepack enable`, ou `npx pnpm` se corepack não estiver disponível)
- Docker (Postgres + Redis locais)

## Começando

```bash
pnpm install
docker compose up -d      # Postgres + Redis locais
pnpm test                 # roda os testes de todos os pacotes existentes
pnpm lint
pnpm typecheck
```
