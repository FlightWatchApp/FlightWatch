# SPEC-026 — Recuperação de senha

Status: implementada (ver "Evidência de implementação")
Owner: Identity
Dependências: SPEC-007, SPEC-010, SPEC-024, SPEC-025, ADR-006
Fase: lançamento — Frente B, bloqueador 3 (parte 2)

## Objetivo

Quem esqueceu a senha consegue definir uma nova pelo próprio e-mail, sem
suporte. Hoje a única saída seria criar outra conta.

## Fora do escopo

- troca de senha estando logado (tela de conta);
- mudança de e-mail;
- confirmar o canal de notificação como efeito colateral do reset;
- envio real: o e-mail sai pelo `EMAIL_PROVIDER` configurado (hoje
  `simulated`), como o de confirmação da SPEC-010.

## Fluxo

1. `POST /v1/auth/password-reset/request` com `{ email }`.
   - Responde **sempre `202`**, exista a conta ou não (sem enumeração).
   - Se existir usuário `ACTIVE` com esse e-mail: gera token opaco (mesmo
     gerador da SPEC-010), grava só o hash SHA-256 e o prazo em
     `users.passwordResetTokenHash`/`passwordResetExpiresAt` (um pedido novo
     substitui o anterior) e envia o e-mail com o link
     `WEB_BASE_URL/reset-password?token=…`.
   - O envio **não é aguardado** pela resposta: o tempo de resposta não revela
     se a conta existe. Falha de envio é logada (`password_reset_email_send_failed`).
2. `POST /v1/auth/password-reset/confirm` com `{ token, password }`.
   - Senha com a mesma regra do cadastro (10 a 256 caracteres).
   - Token desconhecido → `400 INVALID_RESET_TOKEN`; vencido → `400 RESET_TOKEN_EXPIRED`;
     usuário que não está `ACTIVE` → `400 INVALID_RESET_TOKEN` (não revela o estado).
   - Sucesso (`204`), numa transação: grava o novo hash Argon2id, **apaga o
     token** (uso único), zera `failedLoginAttempts`/`lockedUntil` e **apaga
     todas as sessões** do usuário.

Prazo do token: **1 hora**. Ambas as rotas usam o rate limit `auth` da SPEC-025.

## Web

- `/forgot-password`: formulário de e-mail; após enviar, mostra sempre a mesma
  mensagem ("se existir uma conta com esse e-mail, enviamos um link").
- `/reset-password?token=…`: nova senha + confirmação; sucesso leva ao login com
  aviso de que as sessões foram encerradas.
- Link "Esqueci minha senha" na tela de login.

## Persistência

Migração aditiva: duas colunas anuláveis em `users` e índice único em
`passwordResetTokenHash`. Nada existente muda.

## Segurança e privacidade

- Token nunca persistido em claro, nunca logado; e-mail completo nunca logado.
- Sem enumeração por resposta ou por tempo.
- Reset encerra sessões existentes: quem tinha acesso indevido perde.

## Observabilidade

`auth_password_reset_total{step,result}`:

- `step=request`: `sent`, `ignored` (sem conta ativa);
- `step=confirm`: `success`, `invalid_reset_token`, `reset_token_expired`.

## Critérios de aceitação

- **AC-1** Pedido para e-mail existente e para inexistente respondem `202` com o
  mesmo corpo; só o existente recebe e-mail.
- **AC-2** O link do e-mail leva a `/reset-password?token=` e o token permite
  definir nova senha; a senha antiga deixa de funcionar e a nova funciona.
- **AC-3** O token só funciona uma vez.
- **AC-4** Token vencido → `RESET_TOKEN_EXPIRED`; desconhecido → `INVALID_RESET_TOKEN`.
- **AC-5** Após o reset, sessões anteriores deixam de valer.
- **AC-6** Após o reset, o bloqueio por tentativas é zerado.
- **AC-7** Senha fora da regra → `400 INVALID_AUTH_INPUT`, token preservado.
- **AC-8** Um segundo pedido invalida o token do primeiro.
- **AC-9** Usuário não `ACTIVE` não recebe e-mail e não consegue confirmar.

## Testes

`apps/api/src/auth/password-reset.e2e.spec.ts` (Postgres real, sender em
memória) cobre AC-1 a AC-9; template com teste unitário em
`packages/notifications`.

## Rollout e rollback

Migração aditiva (rollback do código não exige reverter a migração). Kill
switch: nenhum além do rate limit; o fluxo só envia e-mail para contas
existentes.

## Evidência de implementação

2026-10-06, branch `feat/password-reset`.

- Contrato: `passwordResetRequestSchema`/`passwordResetConfirmSchema`
  (`packages/contracts/src/auth/password-reset.ts`), reaproveitando
  `emailSchema`/`passwordSchema` do cadastro; códigos `INVALID_RESET_TOKEN` e
  `RESET_TOKEN_EXPIRED`.
- Migração `20261006210000_add_password_reset_token` (duas colunas nullable +
  índice único). Aplicada no banco local; `prisma migrate diff --from-url
--to-schema-datamodel --exit-code` sem diferenças.
- API: `requestPasswordReset`/`confirmPasswordReset` em `AuthService`; a
  confirmação usa `updateMany` condicionado ao hash do token (uso único sob
  concorrência) e apaga as sessões na mesma transação; métrica
  `auth_password_reset_total{step,result}`.
- Template `renderPasswordResetEmail` (3 testes).
- Web: `/forgot-password`, `/reset-password` e link na tela de login. A página
  não consome o token ao abrir (scanners de e-mail pré-carregam links).
- Testes: `password-reset.e2e.spec.ts`, 11 casos com Postgres real (AC-1 a
  AC-9). Suíte total 616 testes verdes; format, lint, typecheck, check:design
  e build verdes.
- Execução real (`next start` em produção + API): `/login`, `/forgot-password`,
  `/reset-password?token=…` e `/reset-password` sem token respondem 200 com o
  conteúdo esperado (este último, a mensagem de link incompleto).
