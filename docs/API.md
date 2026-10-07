# API — Flight Watch

A API está em `apps/api`, usa NestJS com Fastify e expõe JSON versionado em
`/v1`. Os schemas de fronteira ficam em `packages/contracts` e são validados
por pipes antes de chegar aos serviços.

## Autenticação

Rotas protegidas recebem `Authorization: Bearer <session-token>` do BFF. A API
não lê cookies. O web também envia os headers internos assinados para que o
rate limit use o IP real do cliente quando o proxy estiver configurado.

O rate limit padrão da busca é separado do rate limit de autenticação:

| Limite                      | Padrão                    | Variáveis                                          |
| --------------------------- | ------------------------- | -------------------------------------------------- |
| `POST /v1/searches/flights` | 10 por 60 s por IP        | `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`           |
| auth sensível               | 20 por 10 min por rota/IP | `AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MS` |

O código de erro de excesso é `RATE_LIMITED` com HTTP `429`.

## Endpoints

### Identidade — `/v1/auth`

| Método e rota                  | Auth        | Sucesso | Uso                                    |
| ------------------------------ | ----------- | ------: | -------------------------------------- |
| `POST /register`               | não         |   `201` | cria conta pendente de confirmação     |
| `POST /login`                  | não         |   `200` | cria sessão e devolve token opaco      |
| `POST /logout`                 | sim         |   `204` | revoga a sessão atual                  |
| `GET /me`                      | sim         |   `200` | retorna usuário autenticado            |
| `POST /verify-email`           | token       |   `200` | confirma e-mail                        |
| `POST /resend-verification`    | sim         |   `204` | reenvia confirmação do próprio usuário |
| `POST /password-reset/request` | não         |   `202` | solicita reset sem enumeração          |
| `POST /password-reset/confirm` | token       |   `204` | define senha e encerra sessões         |
| `POST /delete-account`         | sim + senha |   `204` | anonimiza a conta em transação         |

### Busca e ofertas

| Método e rota                  | Auth | Sucesso | Uso                         |
| ------------------------------ | ---- | ------: | --------------------------- |
| `POST /v1/searches/flights`    | não  |   `201` | busca pública de descoberta |
| `GET /v1/searches/flights/:id` | não  |   `200` | lê resultado persistido     |
| `POST /v1/offers/:id/watch`    | sim  |   `201` | deriva Watch de uma oferta  |

Busca pública é síncrona para a pessoa, mas usa o provider simulado e grava
resultado/estado para a página de detalhe. O `FlightSearch` é diferente de um
`Watch`: ele não cria intenção de monitoramento até a pessoa escolher
“Monitorar”.

### Monitoramentos — `/v1/watches`

| Método e rota              | Auth | Sucesso | Uso                                  |
| -------------------------- | ---- | ------: | ------------------------------------ |
| `GET /`                    | sim  |   `200` | lista apenas Watches do usuário      |
| `GET /:id`                 | sim  |   `200` | detalhe e histórico do próprio Watch |
| `POST /`                   | sim  |   `201` | cria Watch; aceita `Idempotency-Key` |
| `POST /:id/pause`          | sim  |   `200` | pausa                                |
| `POST /:id/reactivate`     | sim  |   `200` | reativa quando permitido             |
| `POST /:id/cancel`         | sim  |   `200` | encerra                              |
| `POST /:id/purchase-click` | sim  |   `204` | registra clique, não redireciona     |

Autorização é por propriedade do recurso. Um ID válido de outra pessoa não
permite leitura nem alteração.

### Oportunidades e operação

| Método e rota           | Auth | Uso                                              |
| ----------------------- | ---- | ------------------------------------------------ |
| `GET /v1/opportunities` | não  | feed/mapa de oportunidades calculadas em leitura |
| `GET /health`           | não  | sinal sanitizado para health check               |

`/metrics` fica em listener interno dedicado, normalmente `127.0.0.1:9100` na
API e `9101`–`9104` nos workers. Ele não é exposto na porta pública da API.

## Códigos e estados relevantes

Os códigos de erro fechados ficam em `packages/contracts/src/**/errors.ts`.
Entre os códigos de autenticação estão `INVALID_CREDENTIALS`,
`ACCOUNT_LOCKED`, `UNAUTHENTICATED`, `RATE_LIMITED`,
`INVALID_RESET_TOKEN` e `RESET_TOKEN_EXPIRED`. O formato de erro é filtrado por
módulo para não vazar detalhes internos.

Os estados persistidos mais importantes são:

- User: `PENDING_VERIFICATION`, `ACTIVE`, `BLOCKED`, `DELETED`;
- Watch: `ACTIVE`, `PAUSED`, `COMPLETED`, `EXPIRED`, `CANCELLED`;
- execução: `SCHEDULED`, `RUNNING`, `SUCCEEDED`, `NO_OFFERS`,
  `RETRYABLE_FAILURE`, `PERMANENT_FAILURE`, `RATE_LIMITED`;
- alerta: `PENDING`, `SUPPRESSED`, `QUEUED`, `NOTIFIED`, `FAILED`;
- entrega: `PENDING`, `SENDING`, `DELIVERED`, `RETRYABLE_FAILURE`,
  `PERMANENT_FAILURE`.

Para mudar um contrato público, primeiro atualize a spec, o schema, os testes
de contrato/integração e a documentação. Não exponha tipos de Prisma ou de SDK
externo na resposta.
