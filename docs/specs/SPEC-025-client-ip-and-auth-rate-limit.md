# SPEC-025 — IP real do cliente e rate limit nas rotas de autenticação

Status: implementada (ver "Evidência de implementação")
Owner: Identity / Operations
Dependências: ADR-006 (BFF), SPEC-007, SPEC-010, SPEC-014, SPEC-024
Fase: lançamento — Frente B, bloqueador 3 (parte 1)

## Problema

Pela ADR-006, o navegador fala só com o servidor Next (`apps/web`), e é ele quem
chama a API. A API, portanto, vê **o IP do servidor web em toda requisição**:

- o rate limit "por IP" de `POST /v1/searches/flights` (SPEC-014) é, na prática,
  **um limite global do site** — com `RATE_LIMIT_MAX=10`, a 11ª busca do minuto
  falha para qualquer pessoa;
- login, cadastro, reenvio e confirmação de e-mail não têm limite nenhum; o
  bloqueio após 5 senhas erradas (SPEC-007) protege uma conta, não impede
  tentativa em massa contra muitas contas (credential stuffing).

## Objetivo

1. A API identifica o IP real do cliente quando a requisição vem do web, sem
   permitir que um cliente qualquer forje o próprio IP.
2. Rate limit por IP nas rotas públicas de autenticação.

## Fora do escopo

- storage compartilhado (Redis) para o throttler: o lançamento usa uma réplica
  da API; com mais réplicas cada uma conta separado (registrado em
  `CLAUDE.md` §10.2);
- limite por conta/usuário além do bloqueio já existente;
- CAPTCHA.

## Comportamento

### IP do cliente (BFF → API)

- O web envia, em toda chamada à API, `x-fw-client-ip` (primeiro IP de
  `x-forwarded-for` ou `x-real-ip` recebidos pelo Next) e
  `x-fw-internal-secret` (`INTERNAL_API_SECRET`).
- A API usa `x-fw-client-ip` como identidade do rate limit **somente** se
  `x-fw-internal-secret` for igual a `INTERNAL_API_SECRET` (comparação em tempo
  constante) e o IP tiver formato válido. Caso contrário usa o IP da conexão.
- O web confia no `x-forwarded-for` que recebe: em produção ele precisa estar
  atrás do proxy da plataforma de hospedagem, que sobrescreve esse header.

### Segredo interno

`INTERNAL_API_SECRET` (API e web): mínimo de 32 caracteres. Em
`development`/`test` tem um padrão local. Em `staging`/`production` é
obrigatório e **não pode ser o valor de desenvolvimento** — regra geral da
SPEC-024 a partir desta spec: nenhum padrão local é aceito fora de
`development`/`test`. O web em produção (`NODE_ENV=production`) sem a variável
falha na primeira chamada à API, em vez de seguir sem identificar o cliente.

### Limites

Throttlers nomeados, contados por rota e por IP:

| Throttler | Rotas                                                             | Padrão        | Variáveis                                          |
| --------- | ----------------------------------------------------------------- | ------------- | -------------------------------------------------- |
| `default` | `POST /v1/searches/flights`                                       | 10 por 60 s   | `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`           |
| `auth`    | `POST /v1/auth/{register,login,verify-email,resend-verification}` | 20 por 10 min | `AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MS` |

Valores moderados de propósito: CGNAT de operadoras móveis coloca muitas pessoas
atrás do mesmo IP. Excedido o limite, a resposta é `429` com
`{ code: "RATE_LIMITED" }` no formato de erro de cada módulo (`AuthError`,
`SearchError`), e o web mostra uma mensagem própria.

## Segurança e privacidade

- O segredo nunca é logado nem devolvido em erro (SPEC-024 AC-6).
- IP não vira label de métrica.
- Header forjado sem o segredo é ignorado — o cliente não escolhe a própria
  identidade de rate limit.

## Critérios de aceitação

- **AC-1** Com segredo válido, dois IPs de cliente diferentes têm orçamentos de
  rate limit independentes.
- **AC-2** Com segredo ausente ou errado, `x-fw-client-ip` é ignorado.
- **AC-3** IP com formato inválido é ignorado.
- **AC-4** Excedido `AUTH_RATE_LIMIT_MAX`, login responde `429 RATE_LIMITED`.
- **AC-5** Rotas de auth não consomem o orçamento da busca, e vice-versa.
- **AC-6** `INTERNAL_API_SECRET` é obrigatório, com mínimo de 32 caracteres, em
  `staging`/`production`, e o valor de desenvolvimento é rejeitado lá.
- **AC-7** O web envia os dois headers, extraindo o primeiro IP de
  `x-forwarded-for`.

## Testes

- `apps/api/src/throttling/client-ip.spec.ts` — AC-2, AC-3 (unitário);
- `apps/api/src/throttling/rate-limit.e2e.spec.ts` — AC-1, AC-4, AC-5;
- `packages/config/src/load.test.ts` — AC-6;
- `apps/web/src/lib/api/internal-headers.test.ts` — AC-7.

## Rollout, rollback e kill switch

Sem migração. Rollback = reverter o commit. Limites ajustáveis por variável sem
deploy de código.

## Evidência de implementação

2026-10-06, branch `feat/auth-rate-limit`.

- Contrato: `CLIENT_IP_HEADER`/`INTERNAL_SECRET_HEADER` em
  `packages/contracts/src/shared/internal-headers.ts`; `AuthErrorCode`
  ganha `RATE_LIMITED` (429).
- API: `resolveClientIp` (comparação com `timingSafeEqual`, IP validado por
  `net.isIP`); `ThrottlingModule` com os throttlers `default` e `auth` e o
  `getTracker`; `@AuthRateLimited()` em register, login, verify-email e
  resend-verification (não em `GET /me`, chamado a cada página).
- Config: `INTERNAL_API_SECRET` (mín. 32), `AUTH_RATE_LIMIT_*`; regra geral em
  `loadConfig` rejeitando padrão local fora de development/test.
- Web: `apiFetch` envia os dois headers; mensagens de `RATE_LIMITED` em login,
  cadastro, confirmação e reenvio.
- Testes: 9 unitários (`client-ip.spec.ts`), 4 e2e com Postgres real
  (`rate-limit.e2e.spec.ts`), 4 de config, 8 no web. Suíte total: 600 testes,
  todos verdes; format, lint, typecheck, check:design e build verdes (build do
  web sem `INTERNAL_API_SECRET` definido).
- Binário real da API com `AUTH_RATE_LIMIT_MAX=2`: cliente A com segredo
  `401 401 429`; cliente B com segredo `401`; IPs forjados sem segredo
  `401 401 429`.
