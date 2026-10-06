# SPEC-027 — Exclusão de conta pelo próprio usuário

Status: implementada — **política de dados aguardando aprovação do owner**
(`CLAUDE.md` §21: exclusão de dados e política de retenção exigem aprovação
humana explícita)
Owner: Identity
Dependências: SPEC-007, SPEC-008, SPEC-025, SPEC-026, EVAL-NOTIFY-004
Fase: lançamento — Frente B, bloqueador 5 (parte técnica da LGPD)

## Objetivo

A pessoa exclui a própria conta pelo site, sem pedir ao suporte (LGPD art. 18,
VI: eliminação dos dados pessoais tratados com consentimento).

## Decisão de política (para aprovação)

**Anonimizar a conta em vez de apagar as linhas.**

| Dado                                      | Tratamento                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| `users.email`                             | vira `deleted-<id>@deleted.invalid` (e-mail fica livre para novo cadastro) |
| `users.passwordHash`                      | substituído por valor que nenhuma senha satisfaz                           |
| `users.timezone`                          | vira `UTC`                                                                 |
| `users.status`                            | `DELETED`                                                                  |
| tokens de verificação/redefinição         | apagados                                                                   |
| `sessions`                                | apagadas                                                                   |
| `notification_channels.destination`       | vira `deleted-<id>@deleted.invalid`; canal `REVOKED`; `version + 1`        |
| `watches` ativos ou pausados              | `CANCELLED` (mesma transição da SPEC-008)                                  |
| `alert_events`, `notification_deliveries` | mantidos: guardam preço e referência opaca ao canal, sem dado pessoal      |
| `search_targets`, `price_observations`    | mantidos: dado de mercado compartilhado, não pertence à pessoa             |

**Por que anonimizar:** eventos de alerta e entregas são registro de auditoria
(SPEC-005/006) e dependem das linhas de `watches`/`notification_channels`.
Apagar em cascata perderia esse histórico e exigiria migração destrutiva. Dado
anonimizado não é dado pessoal (LGPD art. 12) desde que a reidentificação não
seja possível por meios razoáveis — por isso o e-mail e o destino são
sobrescritos, não só marcados.

**Alternativa descartada:** apagar fisicamente usuário, canais e watches em
cascata. Mais simples de explicar, mas perde auditoria e exige mudar as FKs.

**Pendente de decisão (não implementado):** prazo para expurgar de vez as
linhas anonimizadas; política de backups (o dado original continua nos backups
até eles expirarem — precisa constar na política de privacidade).

## Fora do escopo

- exportação dos dados (portabilidade, art. 18 V);
- período de arrependimento/reativação;
- exclusão iniciada por administrador.

## Contrato

`POST /v1/auth/delete-account` (sessão obrigatória, rate limit `auth`), corpo
`{ "password": "..." }`.

- Senha errada → `401 INVALID_CREDENTIALS` e conta como tentativa falha para o
  bloqueio da SPEC-007 (o endpoint não vira atalho de força bruta).
- Conta bloqueada por tentativas → `423 ACCOUNT_LOCKED`.
- Sucesso → `204`; tudo da tabela acima numa única transação.

## Observabilidade

`auth_account_deletion_total{result}`: `success`, `invalid_credentials`,
`account_locked`. Log `auth_account_deleted` com o `userId` (opaco), nunca o
e-mail.

## Web

Página `/account`: mostra o e-mail da conta, link para trocar a senha (fluxo da
SPEC-026) e a seção "Excluir minha conta" com confirmação por senha e aviso de
que a ação é irreversível. Sucesso apaga o cookie de sessão e leva à home.

## Critérios de aceitação

- **AC-1** Com a senha correta, a conta fica `DELETED`, sem e-mail, timezone ou
  hash originais.
- **AC-2** Sessões apagadas: o token usado deixa de valer.
- **AC-3** Canais `REVOKED`, com destino anonimizado e versão incrementada.
- **AC-4** Watches ativos/pausados ficam `CANCELLED`; terminais não mudam.
- **AC-5** Login com o e-mail antigo falha; um novo cadastro com o mesmo e-mail
  funciona.
- **AC-6** Senha errada → `401` e incrementa as tentativas falhas; nada é apagado.
- **AC-7** Sem sessão → `401 UNAUTHENTICATED`.
- **AC-8** Uma conta não afeta dados de outra.

## Testes

`apps/api/src/auth/account-deletion.e2e.spec.ts` (Postgres real) cobre AC-1 a AC-8.

## Rollout e rollback

Sem migração. A operação é irreversível por natureza para a conta afetada;
rollback do código só impede novas exclusões.

## Evidência de implementação

2026-10-06, branch `feat/account-deletion`. Política de dados implementada
como proposta acima; **aprovação do owner pendente** antes do merge.

- Contrato: `deleteAccountRequestSchema`.
- API: `POST /v1/auth/delete-account` (`SessionAuthGuard` + rate limit `auth`);
  `AuthService.deleteAccount` confere a senha (falha conta para o bloqueio),
  gera um hash Argon2 válido de bytes descartados e anonimiza tudo numa
  transação; métrica `auth_account_deletion_total{result}`.
- Validação dos pipes de auth extraída para `parse-auth-input.ts` (reuso com a
  SPEC-026).
- Web: `/account` (e-mail, trocar senha, excluir) e `/account/deleted`; o
  e-mail no cabeçalho passou a ser link para `/account`.
- Testes: `account-deletion.e2e.spec.ts`, 5 casos com Postgres real cobrindo
  AC-1 a AC-8. Suíte total: 621 testes verdes; format, lint, typecheck,
  check:design e build verdes.
- Execução real (`next start` em produção + API): `/account` sem sessão →
  `307` para `/login`; com cookie de sessão → `200` com as seções de senha e
  exclusão; `/account/deleted` → `200`.
