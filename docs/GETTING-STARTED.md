# Getting Started — Flight Watch

Este guia prepara um ambiente local reproduzível para uma pessoa nova no
projeto. Ele descreve o fluxo verificado no repositório atual; não substitui as
specs nem as instruções de segurança de `AGENTS.md`.

## 1. Pré-requisitos

- Node.js na versão de `.nvmrc`;
- pnpm 10 (`corepack enable`);
- Docker com Compose;
- Git.

O Docker é necessário não só para o ambiente, mas também para os testes que
sobem PostgreSQL e Redis via Testcontainers.

## 2. Instalação

Na raiz do repositório:

```bash
corepack enable
pnpm install
docker compose up -d
cp packages/database/.env.example packages/database/.env
pnpm --filter @flight-watch/database prisma:deploy
pnpm --filter @flight-watch/database prisma:seed
pnpm build
```

O `docker compose up -d` sem profile sobe somente PostgreSQL 16 e Redis 7.
O banco local usa:

```text
DATABASE_URL=postgresql://flight_watch:flight_watch@localhost:5432/flight_watch
REDIS_URL=redis://localhost:6379
```

O seed é idempotente e cria a conta `dev-local@example.com` com a senha
`dev-local-password-123`. Esses dados são descartáveis e não devem sair do
ambiente local.

## 3. Execução em desenvolvimento

Abra um terminal para cada processo:

```bash
pnpm --filter @flight-watch/api start:dev
pnpm --filter @flight-watch/scheduler start:dev
pnpm --filter @flight-watch/price-worker start:dev
pnpm --filter @flight-watch/alert-worker start:dev
pnpm --filter @flight-watch/notification-worker start:dev
pnpm --filter @flight-watch/web dev
```

Endereços padrão:

| Processo              | Porta | Métricas |
| --------------------- | ----: | -------: |
| `web`                 |  3100 |        — |
| `api`                 |  3000 |     9100 |
| `scheduler`           |     — |     9101 |
| `price-worker`        |     — |     9102 |
| `alert-worker`        |     — |     9103 |
| `notification-worker` |     — |     9104 |

Teste rapidamente:

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

Para ver o fluxo funcional, abra o web, entre com a conta do seed, crie um
monitoramento e deixe os workers ativos. O provider simulado devolve uma oferta
determinística para a rota e data da busca.

## 4. Stack completa em Docker

```bash
docker compose --profile stack up --build
```

O profile cria Postgres, Redis, migração e os seis processos. A imagem tem
targets separados no [Dockerfile](../Dockerfile): `migrate`, `api`,
`scheduler`, `price-worker`, `alert-worker`, `notification-worker` e `web`.

O serviço `migrate` termina após `prisma migrate deploy`; os demais dependem do
sucesso dele. A stack usa `APP_ENV=staging`, mas mantém os adapters simulados
para ser segura e reproduzível localmente.

## 5. Variáveis de ambiente

Comece por [`.env.example`](../.env.example). As variáveis mais importantes
são:

| Variável                      | Usada por               | Finalidade                                       |
| ----------------------------- | ----------------------- | ------------------------------------------------ |
| `APP_ENV`                     | todos                   | `development`, `test`, `staging` ou `production` |
| `DATABASE_URL`                | API/workers             | conexão PostgreSQL                               |
| `REDIS_URL`                   | scheduler/workers       | conexão Redis/BullMQ                             |
| `WEB_BASE_URL`                | API/web/notificações    | links gerados para o site                        |
| `API_BASE_URL`                | web                     | URL interna da API, server-to-server             |
| `INTERNAL_API_SECRET`         | web/API                 | autentica headers internos do BFF                |
| `FLIGHT_PROVIDER`             | API/price-worker        | hoje apenas `simulated`                          |
| `EMAIL_PROVIDER`              | API/notification-worker | hoje apenas `simulated`                          |
| `METRICS_HOST`/`METRICS_PORT` | cada processo           | listener interno de métricas                     |

Em `staging` e `production`, o segredo interno precisa ter pelo menos 32
caracteres e não pode ser o valor local padrão. Em `production`, os adapters
simulados são rejeitados no startup.

Configuração inválida faz o processo falhar antes de iniciar suas conexões.
Mensagens de erro não ecoam segredos.

## 6. Migrações e Prisma

```bash
pnpm --filter @flight-watch/database prisma:generate
pnpm --filter @flight-watch/database prisma:deploy
pnpm --filter @flight-watch/database prisma:seed
```

Para criar uma migração durante desenvolvimento, use o comando do pacote e
revise o SQL gerado:

```bash
pnpm --filter @flight-watch/database prisma:migrate
```

Migrações publicadas são imutáveis. Mudanças incompatíveis precisam de
expansão/contração, backfill observável e plano de rollback ou roll-forward.

## 7. Testes e gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm check:design
pnpm build
```

Durante o desenvolvimento, rode primeiro o pacote afetado. Antes de abrir PR,
rode a suíte global e registre os comandos reais. Testes de integração falham
se Docker não estiver disponível.

## 8. Troubleshooting

### API não sobe

Confira se Postgres está saudável, se `DATABASE_URL` aponta para `localhost` no
modo local e se as migrações foram aplicadas. Se a mensagem indicar
`INTERNAL_API_SECRET`, confirme o comprimento e o `APP_ENV`.

### Web abre, mas as requisições falham

Confirme `API_BASE_URL=http://localhost:3000`, `WEB_BASE_URL=http://localhost:3100`
e o segredo interno igual entre web e API. O navegador não chama a API
diretamente; o Next.js faz essa ponte no servidor.

### Não chegam alertas

Confirme que scheduler, price-worker, alert-worker e notification-worker estão
rodando. A conta precisa ter canal verificado; o seed já cria o canal de e-mail
verificado. O envio atual é em memória e simulado.

### Testes de integração falham ao criar containers

Verifique `docker info`, espaço disponível e se não há containers de testes
órfãos consumindo memória. Rode o teste do pacote afetado antes da suíte global.

### `format:check` acusa arquivo gerado do Next

`apps/web/next-env.d.ts` pode ser reescrito pelo Next com aspas diferentes. Não
desative o formatter nem adicione exceção silenciosa; registre o gate conforme
`docs/design-refactor/05-quality-gates.md` e a decisão P-07.
