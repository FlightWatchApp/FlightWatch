# SPEC-028 — Imagens de container e stack local de produção

Status: implementada (ver "Evidência de implementação")
Owner: Operations
Dependências: SPEC-024, SPEC-025, ADR-001
Fase: lançamento — Frente B, bloqueador 4 (parte 1)

## Objetivo

Empacotar os seis processos e as migrações numa imagem reproduzível, que roda
em qualquer plataforma que aceite containers (a escolha da hospedagem ainda
está em aberto), e poder subir a stack inteira localmente com a mesma
configuração de staging.

## Fora do escopo

- escolha da plataforma, domínio, TLS e secrets de produção;
- pipeline de publicação da imagem (registry) e deploy automático;
- imagem mínima por serviço (ver "Questões em aberto");
- backups, Sentry.

## Comportamento

### Imagem

Um `Dockerfile` na raiz, multi-stage, baseado em `node:24-bookworm-slim`
(mesma versão do `.nvmrc`; Debian em vez de Alpine para os binários do Prisma
e do Argon2 não dependerem de musl):

| Target                | Comando                                      | Porta HTTP    |
| --------------------- | -------------------------------------------- | ------------- |
| `api`                 | `node apps/api/dist/main.js`                 | `PORT` (3000) |
| `scheduler`           | `node apps/scheduler/dist/main.js`           | —             |
| `price-worker`        | `node apps/price-worker/dist/main.js`        | —             |
| `alert-worker`        | `node apps/alert-worker/dist/main.js`        | —             |
| `notification-worker` | `node apps/notification-worker/dist/main.js` | —             |
| `web`                 | `next start` em `PORT` (3100)                | `PORT`        |
| `migrate`             | `prisma migrate deploy` e sai                | —             |

- Processo roda como usuário `node`, não root.
- `NODE_ENV=production` na imagem: pela SPEC-024, `APP_ENV` passa a ser
  obrigatória e os padrões locais deixam de valer — a imagem não sobe por
  acidente apontando para `localhost`.
- `migrate` é um passo separado, executado antes de subir a nova versão (nunca
  no startup da API, para várias réplicas não migrarem ao mesmo tempo).
- `METRICS_HOST` continua `127.0.0.1` por padrão: no container, métricas só
  ficam acessíveis se o deploy definir `METRICS_HOST=0.0.0.0` numa rede interna.

### Stack local

`docker compose --profile stack up --build` sobe Postgres, Redis, `migrate` e os
seis processos com `APP_ENV=staging` (adapters simulados permitidos), web em
`http://localhost:3100`. Sem `--profile stack`, `docker compose up -d` continua
subindo só Postgres e Redis, como antes.

## Segurança

- Nenhum segredo na imagem; `.dockerignore` exclui `.env*` (exceto o exemplo),
  `.git`, `.local` e artefatos.
- Usuário sem privilégio.
- O segredo interno da stack local é fixo no compose e serve só para uso local.

## Critérios de aceitação

- **AC-1** `docker build` de todos os targets conclui a partir de um clone limpo.
- **AC-2** A stack sobe: `migrate` termina com sucesso, `/health` da API
  responde `ok` e o web serve `/login`.
- **AC-3** A imagem roda como usuário não root.
- **AC-4** O contexto de build não contém `.env`, `.git` nem `.local`.

## Rollout e rollback

Sem efeito no código em execução. Rollback = voltar à tag de imagem anterior;
migrações são aditivas (regra do projeto).

## Questões em aberto

- Imagem enxuta por serviço (`pnpm deploy` / Next `standalone`): hoje a imagem
  leva a instalação completa do monorepo, inclusive dependências de
  desenvolvimento, porque o CLI do Prisma (`migrate`) é devDependency.
- Plataforma de hospedagem e onde rodar `migrate` no pipeline.

## Evidência de implementação

2026-10-06, branch `feat/docker-images`.

- `Dockerfile` (7 targets), `.dockerignore`, perfil `stack` no
  `docker-compose.yml`; job `docker` na CI constrói `api` e `web`.
- AC-1: `docker compose --profile stack build` construiu as 7 imagens
  (Docker 29.7.2). O `gyp ERR!` do `ssh2` no log é da compilação opcional de
  uma dependência de teste do Testcontainers, que cai para a versão em JS.
- AC-2: `docker compose --profile stack up -d` — `migrate` saiu com código 0
  (`10 migrations found`), API `healthy`, `/health` → `{"status":"ok"}`,
  `/metrics` na porta pública → 404, web `/login` → 200; os cinco processos de
  backend registraram `*_starting` com `"appEnv":"staging"`; conta criada pela
  API e `/account` do web com o cookie → 200 (cadeia web → API com o segredo
  interno dentro da rede do compose).
- AC-3: `id -un` no container da API → `node`.
- AC-4: `ls -a /app` na imagem não tem `.env`, `.git` nem `.local`.
- Tamanho da imagem: 1,67 GB (instalação completa — ver questões em aberto).
