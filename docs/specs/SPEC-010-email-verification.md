# SPEC-010 — Confirmação de e-mail

Status: draft para aprovação
Versão: 0.1
Owner: Identity
Dependências: SPEC-007

## 1. Objetivo

Permitir que o usuário confirme a posse do e-mail usado no registro, preenchendo a lacuna que SPEC-007 §2 deixou explícita ("verificação de posse do email" fora do escopo daquela fase). Sem isso, **nenhum usuário real consegue criar um Watch hoje**: `CHANNEL_NOT_VERIFIED` (SPEC-001 §8) é permanente, porque não existe nenhum caminho para `NotificationChannel.verifiedAt` deixar de ser `null`.

## 2. Fora do escopo

- recuperação/reset de senha (mesma lacuna declarada em SPEC-007 §2, spec própria depois);
- múltiplos canais de e-mail por usuário — registro cria exatamente um canal `EMAIL` (SPEC-007 §6), esta spec confirma esse canal, não adiciona gestão de múltiplos;
- rate limiting por IP no reenvio (SPEC-007 §2 já declarou isso fora de escopo geral);
- mudar `User.status` para `PENDING_VERIFICATION` — o schema tem esse valor como default (`@default(PENDING_VERIFICATION)`, `packages/database/prisma/schema.prisma`) e `DOMAIN.md` §3.1 o define, mas SPEC-007 já implementado cria o usuário direto como `ACTIVE`. Decisão explícita desta spec (confirmada com o usuário antes de implementar, já que é mudança de autorização — `AGENTS.md` §8): **não mexer nisso agora**. Login continua funcionando para conta não verificada; a única trava continua sendo `CHANNEL_NOT_VERIFIED` na criação de Watch. Fica registrado como divergência conhecida entre `DOMAIN.md` e o código, não escondida.

## 3. Decisão arquitetural: envio síncrono, não via outbox/fila

SPEC-006 (alertas) envia e-mail via outbox → fila → `notification-worker`, porque a origem é um pipeline assíncrono (checagem de preço) sem nenhum request HTTP esperando. Aqui é diferente: quem dispara o envio é a própria requisição `POST /v1/auth/register` (ou `resend-verification`), com o usuário já esperando uma resposta.

Enviar via fila só adicionaria latência de fila antes do e-mail sair, sem ganho — já existe um mecanismo de recuperação explícito e mais simples: o usuário pode pedir reenvio (`POST /v1/auth/resend-verification`). Por isso: o envio é direto pela porta `EmailSender` (mesma interface de SPEC-006, `packages/notifications`), fora da transação que cria o usuário (I/O externo nunca dentro de uma transação de banco), e **best-effort** — uma falha no envio não derruba o registro; fica logada e o usuário tem o reenvio como caminho de recuperação.

## 4. Pré-condições

- `verify-email`: nenhuma — o token é a própria credencial de posse (mesmo padrão de link de confirmação de qualquer produto; não expõe nada sem o token);
- `resend-verification`: usuário autenticado (`SessionAuthGuard`) — evita que o endpoint vire um jeito de mandar e-mail pra endereço arbitrário; só reenvia pro próprio canal do usuário logado.

## 5. Entrada

```
POST /v1/auth/verify-email
{ "token": "opaque-token-do-link" }

POST /v1/auth/resend-verification
(sem corpo, usuário identificado pela sessão)
```

## 6. Validação

- `token`: string não vazia;
- token precisa corresponder a um `NotificationChannel.verificationTokenHash` existente;
- se o canal já está verificado, a chamada é bem-sucedida sem alterar nada (idempotente — ver §9);
- se não está verificado e o token expirou (`verificationTokenExpiresAt <= now`), falha com `VERIFICATION_TOKEN_EXPIRED`.

## 7. Comportamento

### Registro (extensão de SPEC-007 §6)

Na mesma transação que cria `User`+`NotificationChannel`+`Session`: gerar um token opaco (`generateOpaqueToken`, mesma função de `session-token.ts`, generalizada nesta spec para `opaque-token.ts`), hashear com SHA-256 e persistir `verificationTokenHash`+`verificationTokenExpiresAt` (24h) no canal. Depois do commit, enviar o e-mail (best-effort, §3).

### `POST /v1/auth/verify-email`

1. Hashear o token recebido, buscar `NotificationChannel` por `verificationTokenHash`.
2. Não encontrado → `INVALID_VERIFICATION_TOKEN`.
3. Já verificado → sucesso, sem escrita (idempotente — cobre clique duplo ou pré-carregamento do link por scanner de e-mail).
4. Não verificado e expirado → `VERIFICATION_TOKEN_EXPIRED`.
5. Não verificado e válido → `verifiedAt = now()`. **Não limpa `verificationTokenHash`** de propósito: um segundo clique no mesmo link precisa continuar caindo no passo 3 (idempotente), não virar `INVALID_VERIFICATION_TOKEN` por já ter sido consumido.

### `POST /v1/auth/resend-verification`

1. Buscar o canal `EMAIL` do usuário autenticado.
2. Já verificado → sucesso, sem escrita, sem enviar e-mail de novo.
3. Não verificado → gerar novo token (invalida o anterior por sobrescrita — só um token ativo por canal), enviar novo e-mail.

## 8. Resposta de sucesso

`verify-email`: `200 OK`, `{ "status": "verified" }`.
`resend-verification`: `204 No Content`.

## 9. Erros

| Status | Código                       | Situação                                          |
| -----: | ---------------------------- | ------------------------------------------------- |
|    400 | `INVALID_AUTH_INPUT`         | `token` ausente/vazio                             |
|    400 | `INVALID_VERIFICATION_TOKEN` | token não corresponde a nenhum canal              |
|    400 | `VERIFICATION_TOKEN_EXPIRED` | token existe, canal não verificado, prazo vencido |
|    401 | `UNAUTHENTICATED`            | `resend-verification` sem sessão válida           |

Nenhum dos dois endpoints confirma a existência de um e-mail específico — `verify-email` não recebe e-mail como parâmetro (só o token), e `resend-verification` opera sobre "o canal do usuário logado", nunca um alvo arbitrário.

## 10. Idempotência e concorrência

- `verify-email` chamado duas vezes com o mesmo token (ou por dois processos concorrentes, ex. usuário abre o link em duas abas): a segunda chamada encontra `verifiedAt` já setado e retorna sucesso sem nova escrita. Corrida real entre as duas (`update` disparado por ambas antes de qualquer commit) não corrompe nada — a coluna vai para o mesmo valor (`now()` em instantes próximos), sem efeito colateral divergente.
- `resend-verification` chamado várias vezes sobrescreve o token anterior a cada chamada — só o último token enviado funciona. Não há proteção contra spam de reenvio nesta fase (fora do escopo, §2); o e-mail antigo simplesmente para de funcionar quando um novo é emitido.

## 11. Eventos

Nenhum evento de outbox — ver §3 (decisão de não usar o pipeline assíncrono aqui).

## 12. Critérios de aceitação

- AC-001: registro cria o canal com token e envia (via `EmailSender`) um e-mail com link de verificação.
- AC-002: `verify-email` com token válido marca o canal verificado e permite criar um Watch em seguida (sem mais `CHANNEL_NOT_VERIFIED`).
- AC-003: `verify-email` chamado duas vezes com o mesmo token é idempotente — segunda chamada não falha.
- AC-004: `verify-email` com token inexistente retorna `400 INVALID_VERIFICATION_TOKEN`.
- AC-005: `verify-email` com token expirado (não verificado) retorna `400 VERIFICATION_TOKEN_EXPIRED`.
- AC-006: `resend-verification` sem sessão retorna `401`.
- AC-007: `resend-verification` gera um novo token que funciona; o token anterior deixa de funcionar.
- AC-008: `resend-verification` num canal já verificado é `204` sem reenviar e-mail.
- AC-009: falha do `EmailSender` durante o registro não impede a criação da conta (best-effort, §3).

## 13. Testes e evals

- e2e (Testcontainers) cobrindo AC-001 a AC-009, mesmo padrão de `auth.e2e.spec.ts`, usando `InMemoryEmailSender` pra inspecionar o conteúdo enviado;
- `EVAL-SEC-002`-equivalente: token de um usuário não verifica canal de outro (garantido pela busca por `verificationTokenHash` global, não por `userId` — não há como um usuário influenciar o token de outro).

## 14. Observabilidade

- contador `auth_verify_email_total{result}` — `result` ∈ `success`/`already_verified`/`invalid_verification_token`/`verification_token_expired`;
- contador `auth_resend_verification_total{result}` — `result` ∈ `sent`/`already_verified`;
- log com `result` (sem token, sem e-mail em texto — os dois já são cobertos pela redação de `packages/observability`'s `logEvent`, mas o call site também não passa esses campos por padrão).

## 15. Performance

Mesma meta de SPEC-001 §14. Lookup por `verificationTokenHash` é indexado (`@unique`), sem full scan.

## 16. Rollout e rollback

Migração aditiva: `verificationTokenHash String? @unique` e `verificationTokenExpiresAt DateTime?` em `NotificationChannel` — expansão pura, sem backfill (canais existentes ficam com os dois campos `null`, já cobertos pelo comportamento de "canal não verificado sem token" — só não são verificáveis até um reenvio ser implementado numa via administrativa, se necessário; não há usuário real ainda, então não é um problema prático agora). Sem feature flag — reaproveita o módulo `AuthModule` já em produção.
