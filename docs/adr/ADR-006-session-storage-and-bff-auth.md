# ADR-006 — Armazenamento de sessão e autenticação via BFF

Status: aceito para v0.1  
Data: 2026-09-20

## Contexto

O sistema precisa de autenticação real (SPEC-007), substituindo o `StubAuthGuard` que hoje confia cegamente num header `x-user-id`. `apps/web` (porta 3100) e `apps/api` (porta 3000) são dois processos/origens distintos; `apps/web` já só chama `apps/api` a partir de código server-side (Server Components e Server Actions), nunca a partir do browser — não existe hoje nenhum fetch client-side para `apps/api` em `apps/web/src`. Essa topologia é o fator decisivo desta decisão, não só a escolha entre JWT e sessão.

## Decisão

Sessão opaca, armazenada no PostgreSQL, com `apps/web` atuando como BFF (Backend-for-Frontend):

- `apps/api` emite um token de sessão aleatório (`randomBytes(32)`, não JWT) e armazena no Postgres apenas o hash SHA-256 do token, nunca o token em texto puro — mesmo princípio já usado para senhas.
- `POST /v1/auth/login` e `POST /v1/auth/register` devolvem o token no corpo JSON da resposta, nunca via `Set-Cookie`. `apps/api` não lê nem escreve cookies em nenhum momento.
- `apps/web`, ao receber o token numa Server Action, seta seu **próprio** cookie httpOnly (`fw_session`) para sua própria origem (`:3100`) via `next/headers`.
- Chamadas subsequentes de `apps/web` para `apps/api` (sempre server-to-server) reenviam esse token como `Authorization: Bearer <token>`.
- `apps/api` valida a sessão consultando o hash do token na tabela `sessions`, verificando expiração.

## Motivos

- `apps/web` nunca chama `apps/api` do browser hoje — logo o cookie que o browser realmente precisa segurar é o de `apps/web`, não o de `apps/api`; fazer `apps/api` tentar setar um cookie cross-origin seria complexidade sem uso real.
- Sessão em Postgres estende o princípio já decidido em ADR-002 (PostgreSQL como fonte de verdade) para identidade, e respeita a regra já existente de que Redis não é fonte de verdade de dado de domínio (AGENTS.md §4).
- Token opaco revogável por `DELETE` de uma linha — sem necessidade de blocklist, ao contrário de JWT.
- Nenhuma dependência nova é necessária no lado do `apps/api` (`@fastify/cookie` não entra) — `next/headers`'s `cookies()` já cobre o lado do `apps/web`.

## Consequências positivas

- superfície de CORS zero: `apps/api` nunca recebe request de origem de browser, então não precisa de política de CORS para autenticação;
- revogação de sessão é imediata e simples (`DELETE FROM sessions WHERE id = ...`), sem espera de expiração de token;
- cookie httpOnly protege o token contra leitura via JavaScript no browser, mesmo sendo `apps/web` quem o gerencia.

## Consequências negativas

- toda request autenticada faz uma consulta ao Postgres para validar a sessão (sem cache) — aceitável no volume atual, pode virar gargalo em escala;
- `apps/web` concentra a responsabilidade de gestão de cookie; um bug ali (ex.: esquecer `httpOnly`) compromete a segurança mesmo com `apps/api` correto;
- sessões expiradas não são limpas ativamente (sem job de limpeza nesta fase) — crescimento não limitado da tabela `sessions` ao longo do tempo.

## Alternativas rejeitadas

### JWT (stateless)

Rejeitado: sem estado no servidor não há como revogar uma sessão antes da expiração sem manter um blocklist — o que reintroduz estado persistente de qualquer forma, com a complexidade adicional de assinatura/verificação sem o benefício real de statelessness aqui (já existe Postgres consultado a cada request de qualquer forma no fluxo de Watches).

### Sessão em Redis

Rejeitado por contrariar AGENTS.md §4 ("Redis não é fonte de verdade de dados de domínio") e o princípio já estabelecido em ADR-002. Redis pode voltar como camada de cache de leitura sobre a tabela `sessions`, se a latência do Postgres se provar um problema real.

### `apps/api` seta cookie cross-origin, browser chama `apps/api` diretamente

Rejeitado: exigiria CORS configurado (`Access-Control-Allow-Origin` específico + `Access-Control-Allow-Credentials`), `SameSite=None; Secure` (já que `:3100` e `:3000` são origens distintas mesmo sendo o mesmo "site" em `localhost`), e quebraria a propriedade atual de `apps/api` não ter nenhuma superfície pública voltada a browser — tudo isso sem nenhum ganho, já que `apps/web` já intermedeia 100% do tráfego.

## Gatilhos para revisão

- latência de validação de sessão (consulta ao Postgres a cada request) deixar de atender ao SLO;
- necessidade de múltiplos frontends/clientes que não sejam `apps/web` (ex.: app mobile) chamando `apps/api` diretamente — nesse caso a decisão de "sem CORS, sem cookie no apps/api" precisa ser revisitada;
- necessidade real de "sair de todos os dispositivos" ou de listar sessões ativas, hoje fora do escopo de SPEC-007.
