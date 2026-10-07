# SPEC-024 — Configuração validada e trava de produção

Status: implementada (ver "Evidência de implementação")
Owner: Operations
Dependências: ADR-004 (provider), SPEC-006 (e-mail), `CLAUDE.md` §10
Fase: lançamento — Frente B, bloqueador 1

## Objetivo

1. Cada processo de backend lê e valida toda a sua configuração **uma vez, no
   startup**, num ponto só (`packages/config`), e **não sobe** com valor
   ausente ou inválido.
2. Impedir que produção rode com provedor de voos ou e-mail **simulados**: hoje
   ambos são fixos no código, e um deploy exibiria preços falsos e marcaria
   e-mails como entregues sem enviá-los.
3. Ter um `.env.example` completo e verificado por teste.

Hoje cada processo faz `Number(process.env.X ?? padrão)`: um valor digitado
errado vira `NaN` em silêncio, e URLs de produção caem em `localhost` sem aviso.

## Fora do escopo

- adapters reais de voo ou e-mail (Frente A e bloqueador 2);
- `apps/web`: `next build` roda com `NODE_ENV=production` e exigiria config de
  runtime no build; fica para a spec de deploy;
- `AFFILIATE_TRACKING_PARAMS`: continua com o parser próprio da SPEC-020, que
  já valida e tolera valor inválido por decisão daquela spec;
- carregar `.env` automaticamente, secret manager.

## Comportamento

### Ambiente

| Variável   | Valores                                        | Regra                                                                                                               |
| ---------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV` | `development`, `test`, `production`            | padrão `development`                                                                                                |
| `APP_ENV`  | `development`, `test`, `staging`, `production` | **obrigatória quando `NODE_ENV=production`**; senão, padrão `test` se `NODE_ENV=test`, `development` caso contrário |

`APP_ENV` existe porque staging também roda com `NODE_ENV=production`, mas pode
usar adapters simulados. A obrigatoriedade evita que um deploy de produção sem
`APP_ENV` caia em `development` e escape da trava.

### Padrões locais

`DATABASE_URL`, `REDIS_URL` e `WEB_BASE_URL` têm padrão apontando para o
`docker compose` local **somente** em `APP_ENV` `development` e `test`. Em
`staging` e `production` são obrigatórias.

### Trava de produção

`FLIGHT_PROVIDER` e `EMAIL_PROVIDER` aceitam hoje só `simulated` (padrão). Com
`APP_ENV=production`, `simulated` é erro de configuração. Consequência
intencional: **produção não sobe até existir adapter real** — é o kill switch.

### Erro

Todos os problemas são reunidos num `ConfigError` com uma linha por chave
(`CHAVE: motivo`). A mensagem **nunca contém o valor recebido** (pode ser
segredo). O processo registra `config_invalid` com as chaves e sai com código 1.

### Variáveis por processo

| Variável                                                         | Processo                 | Padrão                                                              |
| ---------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------- |
| `PORT`                                                           | api                      | `3000`                                                              |
| `METRICS_HOST`                                                   | todos                    | `127.0.0.1`                                                         |
| `METRICS_PORT`                                                   | todos                    | api 9100, scheduler 9101, price 9102, alert 9103, notification 9104 |
| `DATABASE_URL`                                                   | todos                    | local (ver acima)                                                   |
| `REDIS_URL`                                                      | scheduler e workers      | local (ver acima)                                                   |
| `WEB_BASE_URL`                                                   | api, notification-worker | local `http://localhost:3100`                                       |
| `FLIGHT_PROVIDER`                                                | api, price-worker        | `simulated`                                                         |
| `EMAIL_PROVIDER`                                                 | api, notification-worker | `simulated`                                                         |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX`                        | api                      | `60000` / `10`                                                      |
| `SCHEDULER_TICK_INTERVAL_MS`                                     | scheduler                | `5000`                                                              |
| `PRICE_WORKER_CONCURRENCY`                                       | price-worker             | `5`                                                                 |
| `PRICE_WORKER_RATE_LIMIT_CAPACITY` / `_PER_SECOND`               | price-worker             | `10` / `5`                                                          |
| `PRICE_WORKER_CIRCUIT_FAILURE_THRESHOLD` / `_RESET_TIMEOUT_MS`   | price-worker             | `5` / `30000`                                                       |
| `ALERT_WORKER_CONCURRENCY`                                       | alert-worker             | `5`                                                                 |
| `NOTIFICATION_WORKER_CONCURRENCY`                                | notification-worker      | `5`                                                                 |
| `NOTIFICATION_STALE_SENDING_THRESHOLD_MS` / `_SWEEP_INTERVAL_MS` | notification-worker      | `300000` / `60000`                                                  |

Mudanças de nome/padrão em relação ao código anterior:

- `APP_BASE_URL` (notification-worker) passa a ser `WEB_BASE_URL`, o mesmo nome
  usado pela API para a mesma URL. O padrão antigo, `http://localhost:3000`,
  apontava para a API e não para o web (porta 3100).

## Segurança e privacidade

Valores nunca aparecem em erro ou log. `.env.example` não contém segredo real.

## Observabilidade

Evento `config_invalid` com `service` e lista de chaves inválidas; os eventos
`*_starting` passam a incluir `appEnv`.

## Critérios de aceitação

- **AC-1** Valor numérico inválido (`PRICE_WORKER_CONCURRENCY=cinco`) impede o
  startup e o erro nomeia a chave.
- **AC-2** `APP_ENV=production` com `FLIGHT_PROVIDER` ou `EMAIL_PROVIDER`
  `simulated` impede o startup.
- **AC-3** `NODE_ENV=production` sem `APP_ENV` impede o startup.
- **AC-4** `APP_ENV` `staging`/`production` sem `DATABASE_URL`, `REDIS_URL` ou
  `WEB_BASE_URL` impede o startup; em `development` valem os padrões locais.
- **AC-5** Sem nenhuma variável definida, em desenvolvimento, cada processo
  resolve os mesmos valores que usava antes desta spec (exceto `WEB_BASE_URL`
  do notification-worker, corrigido).
- **AC-6** A mensagem de erro não contém o valor recebido.
- **AC-7** Toda chave lida por um schema está em `.env.example`, e toda chave do
  `.env.example` é lida por um schema ou está na lista documentada de chaves
  validadas fora de `packages/config`.
- **AC-8** Nenhum `process.env.X` nos apps de backend fora do ponto de carga
  (exceto testes e o parser de afiliado da SPEC-020).

## Testes

Unitários em `packages/config` cobrem AC-1 a AC-7. AC-8 é verificado por busca
no código durante a revisão. Os testes existentes de api e workers continuam
passando sem alteração de comportamento.

## Rollout, rollback e kill switch

Sem migração. Rollback = reverter o commit. A própria trava é o kill switch:
enquanto não houver adapter real, `APP_ENV=production` não sobe.

## Questões em aberto

- Config do `apps/web` (spec de deploy).
- Carregar `.env` automaticamente nos processos (`node --env-file`) ou deixar
  para a plataforma de deploy.

## Evidência de implementação

2026-10-06, branch `feat/config-producao`.

- `packages/config`: `loadConfig`, `ConfigError`, validadores de campo e as
  cinco definições de processo. 25 testes: `src/load.test.ts` (AC-1 a AC-6) e
  `src/env-example.test.ts` (AC-7, lê o `.env.example` da raiz).
- Factories `createFlightProvider` (`packages/providers`) e `createEmailSender`
  (`packages/notifications`).
- api: `ConfigModule` global (`API_CONFIG`) consumido por `PrismaService`,
  `AuthService` (link de verificação), throttler (`forRootAsync`) e providers
  de voo/e-mail; `main.ts` valida antes de criar o app Nest.
- scheduler e workers: `loadConfig` no início de `main()`; o notification-worker
  recebe o limite de SENDING obsoleto por `NotificationWorkerDeps`.
- `packages/queue`: `createRedisConnection(url)` sem fallback em `process.env`.
- AC-8: `rg "process\.env" apps/*/src packages/*/src` fora de testes retorna
  só os pontos de carga e o parser de afiliado.
- Gates: format, lint e typecheck verdes; 570 testes (545 anteriores sem
  alteração de comportamento + 25 novos); build verde.
- Execução real dos binários compilados (`env -i`, sem nenhuma variável além
  das listadas):
  - `PRICE_WORKER_CONCURRENCY=cinco` → `config_invalid`
    `PRICE_WORKER_CONCURRENCY: deve ser um inteiro entre 1 e 100`, exit 1;
  - api com `APP_ENV=production` e senha no `DATABASE_URL` → `config_invalid`
    para `FLIGHT_PROVIDER` e `EMAIL_PROVIDER`, exit 1, senha ausente do log;
  - notification-worker com `NODE_ENV=production` sem `APP_ENV` →
    `APP_ENV: obrigatória quando NODE_ENV=production`, exit 1;
  - api e price-worker sem nenhuma variável → sobem com `appEnv: development`,
    `/health` responde `{"status":"ok"}`.
