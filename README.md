# Flight Watch

Plataforma para observar preços de passagens aéreas, acompanhar o histórico de
uma rota e receber um alerta quando uma regra configurada for atendida.

O Flight Watch **não vende, reserva nem emite passagens**. Ele consulta ofertas,
registra o que foi observado e leva a pessoa ao site parceiro para confirmar a
compra.

> **Estado atual — verificado em 2026-10-06:** o fluxo ponta a ponta está
> implementado com provedores simulados. O provedor de voos real e o envio de
> e-mail transacional ainda não foram escolhidos/conectados para produção.

## O que o produto faz

- permite buscar voos sem criar conta;
- permite criar um monitoramento (`Watch`) para uma viagem;
- consulta periodicamente um provedor de voos;
- compartilha consultas equivalentes entre pessoas para reduzir chamadas;
- guarda o histórico de preços efetivamente observados;
- detecta preço desejado, queda absoluta, queda percentual e novo menor preço observado;
- exibe promoções calculadas a partir do histórico e um mapa de oportunidades;
- envia alertas por e-mail quando a regra é atendida;
- mostra a idade do preço e a validade da oferta quando disponíveis;
- usa links de compra com aviso de comissão de afiliado e página de transparência.

Preço e disponibilidade podem mudar antes da compra. A linguagem do produto é
deliberadamente precisa: usamos “menor preço observado pelo sistema”, nunca
“menor preço do mercado” ou “garantido”.

## Arquitetura em uma tela

```text
Navegador
   │
   ▼
web — Next.js / App Router / BFF de sessão :3100
   │ chamadas server-to-server
   ▼
api — NestJS + Fastify / REST JSON :3000
   │
   ├── PostgreSQL — fonte de verdade, sessões, domínio e outbox
   └── Redis + BullMQ — filas, leases, rate limit e estado transitório
          │
          ├── scheduler — seleciona SearchTargets elegíveis
          ├── price-worker — consulta, normaliza e grava observações
          ├── alert-worker — avalia regras e cria AlertEvents
          └── notification-worker — renderiza e entrega e-mails
```

O repositório é um monorepo TypeScript com pnpm e Turborepo. Os processos são
separados para poderem escalar independentemente, mas o sistema continua sendo
um monólito modular.

## Começando rapidamente

### Pré-requisitos

- Node.js na versão indicada em [`.nvmrc`](./.nvmrc) (atualmente Node 24);
- pnpm 10, habilitado com `corepack enable`;
- Docker, necessário para PostgreSQL, Redis e testes de integração;
- Git.

### Instalação local

```bash
corepack enable
pnpm install
docker compose up -d

cp packages/database/.env.example packages/database/.env
pnpm --filter @flight-watch/database prisma:deploy
pnpm --filter @flight-watch/database prisma:seed
pnpm build
```

O seed cria uma conta local descartável:

```text
e-mail: dev-local@example.com
senha: dev-local-password-123
```

Essas credenciais só servem para desenvolvimento local. Nunca use a conta do
seed em staging ou produção.

### Subindo os processos

Em terminais separados:

```bash
pnpm --filter @flight-watch/api start:dev
pnpm --filter @flight-watch/scheduler start:dev
pnpm --filter @flight-watch/price-worker start:dev
pnpm --filter @flight-watch/alert-worker start:dev
pnpm --filter @flight-watch/notification-worker start:dev
pnpm --filter @flight-watch/web dev
```

Acesse:

| Processo | Endereço                       | Observação                     |
| -------- | ------------------------------ | ------------------------------ |
| Web      | <http://localhost:3100>        | interface do produto           |
| API      | <http://localhost:3000>        | endpoints versionados em `/v1` |
| Health   | <http://localhost:3000/health> | resposta sanitizada            |
| Métricas | `127.0.0.1:9100` a `9104`      | listener interno por processo  |

As portas de métricas são configuráveis por processo e não ficam expostas na
porta pública da API por padrão.

Para subir a stack inteira em containers, usando configuração equivalente a
staging local:

```bash
docker compose --profile stack up --build
```

Nesse modo, o web fica em <http://127.0.0.1:3100>. O serviço `migrate` aplica as
migrações antes dos demais containers; ele não executa migração no startup da
API.

O passo a passo detalhado, variáveis e solução de problemas está em
[`docs/GETTING-STARTED.md`](./docs/GETTING-STARTED.md).

## Como uma atualização de preço percorre o sistema

1. A pessoa cria um `Watch` com rota, datas e regra de alerta.
2. A API normaliza a solicitação e calcula a chave canônica da pesquisa.
3. Watches equivalentes apontam para o mesmo `SearchTarget`.
4. O scheduler escolhe targets elegíveis e grava uma execução e um evento de outbox na mesma transação.
5. O publicador envia um job `PriceCheckRequested.v1` para BullMQ.
6. O price-worker adquire lease, consulta o `FlightProvider` e classifica a resposta.
7. Uma oferta válida vira uma `PriceObservation` imutável. “Sem ofertas” não vira preço zero e não apaga o último preço válido.
8. O alert-worker avalia os Watches ativos ligados ao target.
9. Uma regra atendida cria um `AlertEvent` com justificativa e chave de deduplicação.
10. O notification-worker cria a entrega, renderiza o e-mail e registra sucesso, falha permanente ou retry.

Jobs podem ser entregues mais de uma vez. Por isso execuções, alertas e
entregas possuem chaves idempotentes persistidas; Redis não é fonte de verdade
do domínio.

## Conceitos essenciais

| Conceito               | Significado                                                     |
| ---------------------- | --------------------------------------------------------------- |
| `Watch`                | intenção individual de uma pessoa monitorar uma viagem          |
| `SearchTarget`         | pesquisa normalizada e compartilhada entre Watches equivalentes |
| `SearchExecution`      | uma tentativa de consultar um target em um provedor             |
| `FlightOffer`          | oferta normalizada recebida do provedor                         |
| `PriceObservation`     | fotografia imutável do resultado selecionado                    |
| `AlertRule`            | condição configurada para disparar um alerta                    |
| `AlertEvent`           | registro auditável de uma regra atendida ou suprimida           |
| `NotificationDelivery` | tentativa idempotente de entrega por canal                      |
| `OutboxEvent`          | evento confirmado no PostgreSQL antes de ser publicado na fila  |

Invariantes importantes:

- `Watch` e `SearchTarget` são entidades diferentes;
- pesquisas equivalentes convergem para um único target;
- dinheiro é inteiro em unidade mínima e sempre tem código de moeda;
- `PriceObservation` não é editada;
- falha de provedor preserva o último preço válido;
- domínio não importa SDK de provedor, ORM, fila ou framework web;
- nenhuma notificação sai sem regra persistida, justificativa e chave idempotente;
- logs não contêm token, senha, payload sensível ou contato completo.

O glossário completo, estados e transições estão em [`docs/DOMAIN.md`](./docs/DOMAIN.md).

## Rotas da interface

| Rota               | Acesso              | Finalidade                                  |
| ------------------ | ------------------- | ------------------------------------------- |
| `/`                | público/autenticado | landing pública ou início da área logada    |
| `/search`          | público             | busca de voos e resultado embutido          |
| `/search/:id`      | público             | detalhe de uma busca concluída              |
| `/opportunities`   | público             | feed e mapa de oportunidades                |
| `/transparencia`   | público             | explicação de afiliados, preços e parceiros |
| `/login`           | público             | entrada na conta                            |
| `/register`        | público             | criação da conta                            |
| `/verify-email`    | público com token   | confirmação do e-mail                       |
| `/forgot-password` | público             | pedido de recuperação de senha              |
| `/reset-password`  | público com token   | definição de nova senha                     |
| `/watches`         | autenticado         | painel de monitoramentos                    |
| `/watches/new`     | autenticado         | criação de monitoramento                    |
| `/watches/:id`     | proprietário        | histórico, preço e ações do monitoramento   |
| `/account`         | autenticado         | conta e exclusão pelo próprio usuário       |
| `/account/deleted` | público             | confirmação após exclusão                   |

O web usa o padrão BFF: o navegador guarda apenas o cookie `httpOnly`
`fw_session` na origem do Next.js; o token opaco é encaminhado server-to-server
para a API como `Authorization: Bearer`. Detalhes em [`docs/WEB.md`](./docs/WEB.md).

## API

A API usa JSON, prefixo `/v1` e contratos compartilhados em
`packages/contracts` com validação Zod na fronteira.

| Grupo         | Endpoints principais                                                                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth          | `POST /v1/auth/register`, `login`, `logout`, `verify-email`, `resend-verification`, `password-reset/request`, `password-reset/confirm`, `delete-account`; `GET /v1/auth/me` |
| Busca         | `POST /v1/searches/flights`, `GET /v1/searches/flights/:id`                                                                                                                 |
| Oferta        | `POST /v1/offers/:id/watch`                                                                                                                                                 |
| Watches       | `GET /v1/watches`, `GET /v1/watches/:id`, `POST /v1/watches`, `pause`, `reactivate`, `cancel`, `purchase-click`                                                             |
| Oportunidades | `GET /v1/opportunities`                                                                                                                                                     |
| Operação      | `GET /health`; métricas em listener interno                                                                                                                                 |

O catálogo de endpoints, autenticação, códigos de erro e contratos está em [`docs/API.md`](./docs/API.md).

## Estrutura do repositório

```text
apps/
  web/                  Next.js, interface e BFF de sessão
  api/                  NestJS/Fastify, HTTP, autenticação e casos de uso
  scheduler/            agenda SearchTargets elegíveis
  price-worker/         consulta o provedor e grava observações
  alert-worker/         avalia regras de alerta
  notification-worker/  entrega e-mails
packages/
  domain/               regras puras, sem infraestrutura
  contracts/            schemas Zod e contratos de requests/jobs
  database/             Prisma, schema, migrações e repositórios
  queue/                BullMQ, Redis e publicação de outbox
  providers/            porta FlightProvider e simulador
  notifications/        porta de e-mail, templates e simulador
  observability/        logs JSON e métricas Prometheus
  config/               configuração por processo e validação de ambiente
docs/
  specs/                especificações de funcionalidades
  adr/                  decisões arquiteturais
  roadmap/              evolução planejada e rascunhos
  design-refactor/      especificações e evals da experiência web v2
  reviews/              revisões técnicas históricas
scripts/design/         gates automáticos de interface
```

Os testes vivem próximos do código (`*.test.ts`, `*.spec.ts` e
`*.integration.test.ts`). Migrações publicadas ficam em
`packages/database/prisma/migrations/` e nunca devem ser editadas depois de aplicadas.

## Configuração e ambientes

Copie [`.env.example`](./.env.example) apenas quando precisar customizar o
ambiente. Em `development` os padrões locais apontam para o Docker Compose.
Em `staging` e `production`, `APP_ENV`, URLs, banco, Redis e
`INTERNAL_API_SECRET` devem ser definidos explicitamente; padrões locais são rejeitados.

Os adapters disponíveis hoje são:

```text
FLIGHT_PROVIDER=simulated
EMAIL_PROVIDER=simulated
```

O modo `production` não sobe com adapters simulados. A lista completa de
variáveis, limites e defaults fica em [`.env.example`](./.env.example) e é
validada por `packages/config`.

## Comandos de desenvolvimento

```bash
pnpm install              # dependências do monorepo
pnpm build                # build de todos os pacotes/apps
pnpm test                 # unitários, integração e e2e de API
pnpm lint                 # ESLint
pnpm typecheck            # TypeScript estrito
pnpm format:check         # Prettier sem alterar arquivos
pnpm check:design         # design system: contraste, tokens, aviso de comissão
pnpm format               # formata o repositório quando a mudança é sua
```

Para trabalhar em um pacote específico, use `pnpm --filter <nome> <script>`;
por exemplo:

```bash
pnpm --filter @flight-watch/domain test
pnpm --filter @flight-watch/web typecheck
pnpm --filter @flight-watch/database prisma:deploy
```

Os mesmos gates principais rodam no GitHub Actions. Testes de integração da
API e de workers usam PostgreSQL/Redis reais via Testcontainers e precisam de
Docker disponível.

## Contribuindo

Antes de mudar comportamento, leia a spec aplicável, `docs/DOMAIN.md`, ADRs
relacionados e a implementação/testes existentes. Para uma alteração de
produto, o fluxo esperado é:

1. definir a spec e os critérios de aceitação;
2. criar ou ajustar o teste que falha pelo motivo esperado;
3. implementar o menor comportamento necessário;
4. rodar os gates aplicáveis;
5. revisar segurança, observabilidade, migração e diff;
6. atualizar a documentação viva e o status da tarefa.

Commits usam Conventional Commits em português. PRs devem informar spec (ou
`n/a — docs/chore`), comportamento, testes executados, migração/rollback,
observabilidade, riscos e pendências.

O guia completo está em [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md). As
regras obrigatórias para agentes e colaboradores estão em [`AGENTS.md`](./AGENTS.md)
e [`CLAUDE.md`](./CLAUDE.md).

## Estado, limites e próximos passos

Implementado e verificado no código atual:

- autenticação por sessão opaca, confirmação de e-mail, recuperação de senha,
  rate limit de autenticação e exclusão iniciada pelo próprio usuário;
- busca pública, oportunidades, mapa, links de compra e transparência de afiliados;
- scheduler, filas, outbox, leases, retries classificados e recuperação de entregas obsoletas;
- histórico de preços, alertas idempotentes e e-mail simulado;
- imagens Docker e stack local completa.

Ainda pendente ou bloqueado para produção:

- escolha e validação jurídica/comercial de provedor de voos real;
- integração de e-mail transacional real;
- política final de retenção, backups e expurgo de contas anonimizadas;
- plataforma de hospedagem, registry, domínio, TLS e pipeline de deploy;
- limites comerciais, planos e SLOs calibrados com dados reais.

[`docs/PROJECT-STATUS.md`](./docs/PROJECT-STATUS.md) mantém o retrato
operacional atual. Para visão de produto e evolução, consulte [`docs/PRODUCT.md`](./docs/PRODUCT.md)
e [`docs/roadmap/`](./docs/roadmap/).

## Documentação de referência

| Documento                                              | Para que serve                                    |
| ------------------------------------------------------ | ------------------------------------------------- |
| [`docs/GETTING-STARTED.md`](./docs/GETTING-STARTED.md) | instalação, execução local, env e troubleshooting |
| [`docs/WEB.md`](./docs/WEB.md)                         | páginas, jornadas, sessão e regras da interface   |
| [`docs/API.md`](./docs/API.md)                         | endpoints, autenticação, erros e headers          |
| [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md)       | fluxo de trabalho, testes, PR e segurança         |
| [`docs/OPERATIONS.md`](./docs/OPERATIONS.md)           | containers, health, métricas e operação           |
| [`docs/PROJECT-STATUS.md`](./docs/PROJECT-STATUS.md)   | o que está implementado, simulado ou pendente     |
| [`docs/PRODUCT.md`](./docs/PRODUCT.md)                 | visão, escopo e objetivos do produto              |
| [`docs/DOMAIN.md`](./docs/DOMAIN.md)                   | entidades, estados, invariantes e fórmulas        |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)       | arquitetura consolidada e fluxos internos         |
| [`docs/adr/`](./docs/adr/)                             | decisões arquiteturais e alternativas descartadas |
| [`docs/specs/`](./docs/specs/)                         | especificação detalhada de cada funcionalidade    |
| [`docs/QUALITY-GATES.md`](./docs/QUALITY-GATES.md)     | gates de PR e release                             |
| [`docs/design-refactor/`](./docs/design-refactor/)     | regras da experiência web v2, evals e progresso   |

O índice completo de documentação está em [`docs/README.md`](./docs/README.md).

## Licença

Nenhuma licença open source foi definida no repositório até o momento. Antes
de publicar o projeto, o owner deve escolher e adicionar uma licença compatível
com o uso pretendido e com as dependências.
