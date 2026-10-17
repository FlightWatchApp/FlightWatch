# SPEC-043 — Acesso por convite, conta de admin e cota mensal de monitoramentos

Status: approved — **Etapa 1** (owner, 2026-10-17). Etapa 2 (webhook de
pagamento) continua rascunho, no fim deste arquivo.
Owner: Identity
Dependências: SPEC-007/ADR-006 (cadastro e sessão), SPEC-008 (pausar Watch),
SPEC-025 (rate limit por IP do cliente), SPEC-026 (redefinição de senha),
SPEC-036 (Resend), SPEC-040 (`/v1/me/overview`), SPEC-041 (Turnstile)
Origem: conversas de 2026-10-16/17; modelo de negócio em
`docs/roadmap/rascunhos/assinatura-convite-whatsapp.md`

> Muda cadastro e autorização (CLAUDE.md §21): aprovado pelo owner para a
> Etapa 1. A Etapa 2 precisa de nova aprovação.

## Decisões do owner (2026-10-17)

| #   | Decisão                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Só quem pagou o acesso ao grupo cria conta: cadastro exige **chave de convite**.                                                                                                                    |
| D2  | Cota de **monitoramentos criados por mês** (ex.: 4 ou 5; valor final em aberto → configurável, padrão 5). Mais que isso será pago (Etapa 2); na Etapa 1 o admin aumenta a cota de uma pessoa à mão. |
| D3  | Plataforma de pagamento: Hotmart ou Mercado Pago (Etapa 2).                                                                                                                                         |
| D4  | As contas que já existem são de teste: sem regra de transição. Produção começa com banco vazio.                                                                                                     |
| D5  | Existe **conta de administrador** com permissões para administrar o sistema.                                                                                                                        |
| D6  | Começar pela Etapa 1 (chaves geradas pelo admin).                                                                                                                                                   |
| —   | Cobrança única ou mensal: **em aberto** (afeta só a Etapa 2).                                                                                                                                       |

### Onde ficam as permissões (D5)

O owner sugeriu um banco não relacional. A spec usa **o Postgres** (coluna
`role` em `users` + tabela de auditoria), porque:

- o Postgres é a fonte de verdade (CLAUDE.md §1.2, §3.1); um banco a mais é
  mais um serviço para subir, proteger, monitorar e incluir no backup
  (SPEC-042) só para guardar um papel;
- a checagem e a ação acontecem na mesma transação (ex.: revogar a chave e
  registrar quem revogou) — com dois bancos, podem divergir;
- dois papéis (`USER`, `ADMIN`) não pedem esquema flexível.

Reavaliar só se surgirem muitos papéis ou permissões finas por recurso.

## Objetivo

1. Cadastro só com chave de convite de uso único, ligada ao e-mail de quem
   pagou.
2. Um admin gera, lista e revoga chaves e administra pessoas (cota, suspensão)
   por uma página no site.
3. Cada pessoa cria no máximo N monitoramentos por mês.

## Fora do escopo (Etapa 1)

- Pagamento automático e webhook (Etapa 2).
- Gerenciar membros do WhatsApp (feito à mão pelo owner).
- Planos com nome e preço; cobrança de extras.
- Permissões além de `USER`/`ADMIN`; vários níveis de admin.
- Fechar páginas públicas: promoções, rotas, calendário e "Ver oferta"
  continuam abertas a todos.
- Virar admin pelo site (só pelo comando no servidor, §Admin).

## Fluxo da Etapa 1

```text
pessoa paga (Hotmart/Mercado Pago) → owner confere o pagamento
  → /admin/convites: e-mail da pessoa → "Gerar chave"
  → sistema envia o e-mail com a chave (e mostra a chave uma vez na tela,
    para mandar também pelo WhatsApp se quiser)
  → pessoa abre o link do e-mail → /register com e-mail e chave preenchidos
  → cria a conta (Turnstile + rate limit já existentes)
```

## Chave de convite

- Gerada no servidor com `randomBytes` (CSPRNG, sem viés de módulo): 25
  caracteres de `23456789ABCDEFGHJKMNPQRSTVWXYZ` (30 símbolos; sem 0/O,
  1/I/L, U) ≈ 122 bits. Exibida em grupos de 5:
  `K7QMX-4XTP9-HRC2W-VAN6D-J3QEZ`.
- Normalização antes do hash: tirar espaços e hífens, maiúsculas. O site
  aceita com ou sem hífen, maiúscula ou minúscula.
- No banco fica **só o hash**: `hashOpaqueToken` (SHA-256,
  `apps/api/src/auth/opaque-token.ts`) da chave normalizada. A chave em claro
  existe só na resposta da criação, no e-mail e no terminal.
- **Uso único**, ligada ao **e-mail** informado na criação (normalizado como
  o e-mail do cadastro).
- Validade: `INVITE_TTL_DAYS` (padrão 30). Vencida = `expiresAt < now()`,
  calculado na leitura (sem job para trocar status).
- Estados persistidos: `AVAILABLE`, `REDEEMED`, `REVOKED`. "Vencida" é
  derivada (`AVAILABLE` + `expiresAt` no passado).
- Criar chave para um e-mail que já tem conta: recusado (`INVITE_EMAIL_TAKEN`,
  só no admin). Criar outra para um e-mail com chave `AVAILABLE`: a anterior
  passa a `REVOKED` na mesma transação (vale sempre a última enviada).

### Link do e-mail

`{WEB_BASE_URL}/register#convite=<CHAVE>&email=<e-mail>` — no **fragmento**
(`#`), que o navegador nunca envia ao servidor: a chave não aparece em log de
acesso, em `Referer` nem na estatística (SPEC-042). O formulário lê o
fragmento no navegador, preenche os campos e limpa o fragmento da barra
(`history.replaceState`).

## Cadastro

- `GET /v1/auth/registration` (público) → `{ "inviteRequired": boolean }`.
  O web usa para mostrar ou não o campo "Chave de acesso" — sem duplicar a
  variável no web.
- `POST /v1/auth/register` ganha `inviteCode?: string` (contrato:
  `registerRequestSchema`, máx. 64 caracteres). Com `INVITE_REQUIRED=true`,
  ausente ou inválido → `400 INVITE_INVALID`.
- Ordem: Turnstile (guard, SPEC-041) → rate limit `auth` → validação →
  **transação**:
  1. `SELECT ... FOR UPDATE` da chave pelo hash;
  2. confere `AVAILABLE`, não vencida e e-mail igual — qualquer falha →
     `INVITE_INVALID` **antes** de olhar se o e-mail já tem conta (não dá para
     descobrir e-mails cadastrados sem uma chave válida);
  3. cria o usuário como hoje (verificação de e-mail continua igual);
  4. marca a chave `REDEEMED` com `redeemedAt` e `redeemedByUserId`.
- Mensagem única para todas as falhas da chave: "Chave de acesso inválida,
  vencida ou já usada. Confira o e-mail em que você recebeu a chave."
- Com `INVITE_REQUIRED=false`, o cadastro funciona como hoje e o campo é
  ignorado (kill switch e ambiente local/E2E).

## Admin

### Papel

- `users.role`: `USER` (padrão) | `ADMIN`.
- Só vira admin pelo comando no servidor (quem tem SSH):
  - local: `pnpm --filter @flight-watch/api admin -- promote --email x@y`
  - produção: `deploy/bin/admin.sh promote --email x@y` (roda o mesmo
    comando dentro do contêiner da `api`).
  - também `demote --email` e `invite --email [--days N]` (gera chave pelo
    terminal, para o primeiro acesso do próprio owner e como plano B se o
    site estiver fora).
- Admin não tem cota mensal (usa o sistema para testar); o limite de 20
  ativos ao mesmo tempo continua valendo.

### Autorização

- `AdminGuard` depois do `SessionAuthGuard`: lê o papel **do banco** a cada
  requisição (rebaixar tira o acesso na hora, sem esperar a sessão vencer).
- Quem não é admin recebe **404** nas rotas de admin (não revela que existem).
- Rotas de admin com o throttler `auth`.
- Toda ação de admin grava `admin_audit_log` na mesma transação da ação:
  `adminUserId`, `action`, `targetType`, `targetId`, `createdAt`. Sem chave,
  sem e-mail, sem payload (CLAUDE.md §11.1).

### API (`/v1/admin`, JSON, contratos em `packages/contracts/src/admin/`)

| Método e rota                       | Faz                                                                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/admin/invites`            | `{ email, ttlDays? }` → cria a chave, envia o e-mail e devolve `{ invite, code }` — `code` só nesta resposta                            |
| `GET /v1/admin/invites`             | lista paginada (cursor), mais recentes primeiro, filtro por estado; nunca devolve a chave nem o hash                                    |
| `POST /v1/admin/invites/:id/revoke` | `AVAILABLE` → `REVOKED`; já usada → `409 INVITE_NOT_REVOCABLE`                                                                          |
| `POST /v1/admin/invites/:id/resend` | gera **nova** chave para o mesmo e-mail (a anterior é revogada) e envia — a chave antiga não pode ser reenviada porque só existe o hash |
| `GET /v1/admin/users`               | lista paginada: e-mail, criação, verificação, papel, acesso, monitoramentos criados no mês / cota, ativos                               |
| `PATCH /v1/admin/users/:id`         | `{ monthlyWatchLimit?: number \| null, accessStatus?: 'ACTIVE' \| 'SUSPENDED' }`                                                        |

O e-mail completo aparece só nessas respostas para o admin (é o que ele
precisa para conferir o pagamento); nunca em log ou métrica.

### Suspender acesso (CDC art. 49 — arrependimento em 7 dias)

- `accessStatus=SUSPENDED`: na mesma transação, todos os Watches `ACTIVE` da
  pessoa vão para `PAUSED` pela mesma transição do pausar existente
  (`transitionWatchStatus`, SPEC-008 — hoje sem evento de outbox; o
  scheduler já ignora Watch que não está `ACTIVE`), e as sessões dela são
  apagadas.
- Pessoa suspensa: o login responde `403 ACCESS_SUSPENDED` ("Seu acesso está
  suspenso. Fale com a gente em contato@flightwatch.com.br."); não cria nem
  retoma monitoramento.
- Reativar (`ACTIVE`) não retoma os Watches sozinho: a pessoa retoma os que
  quiser.

### Web (`/admin`)

- Link "Admin" no cabeçalho só para admin (`role` vem no `AuthenticatedUser`
  que o web já carrega). A página faz a checagem no servidor também; quem não
  é admin vê o 404 do site.
- `/admin/convites`: formulário (e-mail, validade) → mostra a chave **uma vez**
  com botão copiar e o aviso "não dá para ver de novo; se perder, gere outra".
  Tabela: e-mail, estado (disponível, usada, vencida, revogada), criada,
  vence, usada em; ações revogar e gerar nova.
- `/admin/pessoas`: tabela com cota do mês, ativos, acesso; ações mudar cota
  (vazio = padrão) e suspender/reativar (com confirmação).
- Componentes do `docs/DESIGN-SYSTEM.md`; estados vazio, carregando e erro.

## Cota mensal de monitoramentos

- Conta os Watches **criados** pela pessoa no **mês do calendário** em
  `America/Campo_Grande` (CLAUDE.md §8.2: cron e regras humanas nesse fuso),
  em **qualquer estado**: cancelar não devolve a vaga (senão criar e cancelar
  burla a cota). Retomar um pausado não conta.
- Limite: `users.monthlyWatchLimit` se preenchido; senão
  `MONTHLY_WATCH_LIMIT` (padrão 5). Admin: sem limite.
- O limite de 20 ativos ao mesmo tempo (`MAX_ACTIVE_WATCHES_PER_USER`)
  continua, como proteção.
- **Sem corrida:** a transação de criação (`watches.service.ts`, único caminho
  que cria Watch — também usado por `POST /v1/offers/:id/watch`) começa com
  `SELECT ... FROM users WHERE id = $1 FOR UPDATE`; as duas contagens vêm
  depois. Isso resolve também a limitação registrada no comentário atual
  ("checagem de quota best-effort").
- Estourou: `409 WATCH_MONTHLY_LIMIT_REACHED` com
  `{ limit, used, resetsAt }` (`resetsAt` = 1º dia do mês seguinte, 00:00 em
  `America/Campo_Grande`, em UTC no JSON). Web: "Você já criou os 5
  monitoramentos deste mês. Novos ficam liberados em 1º de novembro."
- `GET /v1/me/overview` (SPEC-040) ganha `watchQuota: { used, limit,
resetsAt }` (`limit: null` para admin); o painel e o formulário de criar
  monitoramento mostram "3 de 5 neste mês".
- Contagem: índice `watches(userId, createdAt)`.

## Modelo de dados (migração aditiva)

```prisma
enum UserRole { USER ADMIN }
enum UserAccessStatus { ACTIVE SUSPENDED }
enum AccessInviteStatus { AVAILABLE REDEEMED REVOKED }

model User {
  // ...campos atuais
  role              UserRole         @default(USER)
  accessStatus      UserAccessStatus @default(ACTIVE)
  monthlyWatchLimit Int?             // null = MONTHLY_WATCH_LIMIT
}

model AccessInvite {
  id               String             @id @default(uuid())
  codeHash         String             @unique
  email            String             // normalizado
  status           AccessInviteStatus @default(AVAILABLE)
  expiresAt        DateTime
  createdByUserId  String?            // null = comando no servidor
  redeemedAt       DateTime?
  redeemedByUserId String?            @unique
  revokedAt        DateTime?
  createdAt        DateTime           @default(now())
  @@index([email, status])
  @@index([createdAt])
  @@map("access_invites")
}

model AdminAuditLog {
  id          String   @id @default(uuid())
  adminUserId String?  // null = comando no servidor
  action      String   // invite_created, invite_revoked, invite_resent,
                       // user_limit_changed, user_suspended, user_reactivated,
                       // user_promoted, user_demoted
  targetType  String   // invite | user
  targetId    String
  createdAt   DateTime @default(now())
  @@index([createdAt])
  @@map("admin_audit_log")
}
```

E `@@index([userId, createdAt])` em `Watch`. Nenhuma coluna existente muda;
contas existentes ficam `USER`/`ACTIVE`. Exclusão de conta (SPEC-027): a
chave usada fica com `redeemedByUserId = null` (`onDelete: SetNull`); o log de
auditoria guarda só ids.

## Configuração (`packages/config`, só a API)

| Chave                 | Padrão  | Observação                                                         |
| --------------------- | ------- | ------------------------------------------------------------------ |
| `INVITE_REQUIRED`     | `false` | `true` em `deploy/env.production.example`; `false` é o kill switch |
| `INVITE_TTL_DAYS`     | `30`    | 1 a 90                                                             |
| `MONTHLY_WATCH_LIMIT` | `5`     | 1 a 100; valor final do owner em aberto (4 ou 5)                   |

Entram no `.env.example` (o teste da SPEC-024 exige) e no modelo de
produção.

## E-mail da chave

Mesmo adapter e padrão do e-mail de confirmação (`EMAIL_SENDER`, SPEC-036),
enviado depois do commit. Falha no envio não desfaz a chave: o admin já tem a
chave na tela e pode gerar outra. Assunto: "Sua chave de acesso ao Flight
Watch". Texto: o que é, o link, a chave, a validade, e "se você não comprou o
acesso, ignore este e-mail". Transacional, sem propaganda.

## Observabilidade

- `access_invites_total{source,result}`: `source` = `admin` | `cli`;
  `result` = `created`, `revoked`, `redeemed`, `rejected_invalid`,
  `rejected_expired`, `rejected_email_mismatch`, `rejected_used`,
  `rejected_missing` (o motivo só na métrica, nunca na resposta).
- `admin_actions_total{action}`.
- `watch_monthly_limit_reached_total`.
- Logs: ids opacos; nunca chave, hash, e-mail ou corpo da requisição.

## Segurança

- Chave ≈ 122 bits + rate limit `auth` + Turnstile: adivinhar não é viável.
- Erro único da chave; ordem de checagem não revela e-mails cadastrados.
- Rotas de admin: 404 para não admin; papel lido do banco a cada requisição;
  sem caminho no site para virar admin.
- Auditoria na mesma transação da ação.

## Critérios de aceitação

- **AC-1** Com `INVITE_REQUIRED=true`, cadastro sem chave, com chave errada,
  vencida, revogada ou já usada falha com `400 INVITE_INVALID` e a mesma
  mensagem.
- **AC-2** Chave válida com outro e-mail: `INVITE_INVALID`.
- **AC-3** Dois cadastros simultâneos com a mesma chave: exatamente uma conta.
- **AC-4** Nenhuma tabela contém a chave em claro (teste procura a chave
  gerada em `access_invites` e `admin_audit_log`).
- **AC-5** Com `INVITE_REQUIRED=false`, o cadastro funciona como antes (E2E
  atual passa sem mudança).
- **AC-6** Não admin recebe 404 em todas as rotas `/v1/admin/*` e em
  `/admin`; admin rebaixado perde o acesso na requisição seguinte.
- **AC-7** Toda ação de admin gera uma linha em `admin_audit_log`.
- **AC-8** A 6ª criação no mês (limite 5) falha com
  `WATCH_MONTHLY_LIMIT_REACHED`; cancelar um não libera vaga; no mês seguinte
  libera; `monthlyWatchLimit` da pessoa vale no lugar do padrão; admin não
  tem cota.
- **AC-9** Duas criações simultâneas com 1 vaga restante: exatamente uma
  passa.
- **AC-10** Suspender pausa todos os Watches ativos, apaga as sessões e o login seguinte recebe `ACCESS_SUSPENDED`.
- **AC-11** O link do e-mail preenche o cadastro; a chave não chega ao
  servidor do web na URL (está no fragmento).
- **AC-12** `GET /v1/me/overview` traz `watchQuota` correto.

## Tarefas (ordem de implementação — Orca)

1. **Domínio**: gerar/normalizar/formatar a chave (puro, testável) e cálculo
   do mês em `America/Campo_Grande` (`monthWindow(now)` → início e
   `resetsAt`), com relógio injetado.
2. **Banco**: migração aditiva + repositórios (`access-invite-repository`,
   auditoria, contagem do mês) + testes de integração (AC-3, AC-9 com
   Testcontainers).
3. **Config + contratos**: as 3 variáveis, `.env.example`; schemas de admin,
   `inviteCode` no cadastro, `watchQuota` no overview, códigos de erro
   novos.
4. **API — cadastro e cota**: `GET /v1/auth/registration`, chave no
   `register`, `ACCESS_SUSPENDED` no login, trava e cota mensal no
   `createWatch`, `watchQuota` no overview + e2e (AC-1, 2, 5, 8, 12).
5. **API — admin**: `AdminGuard`, rotas, suspensão, e-mail da chave,
   auditoria, métricas + e2e (AC-4, 6, 7, 10).
6. **Comando**: `apps/api/src/cli/admin.ts` (`promote`, `demote`, `invite`)
   - script `admin` no `package.json` + `deploy/bin/admin.sh` + passo no
     `deploy/README.md` ("criar o primeiro admin").
7. **Web**: campo da chave no cadastro (com o fragmento do link), mensagens
   novas, "3 de 5 neste mês", `/admin/convites`, `/admin/pessoas`, link no
   cabeçalho.
8. **E2E (Playwright)**: um fluxo com `INVITE_REQUIRED=true` — admin gera a
   chave, abre o link do e-mail simulado (`EMAIL_OUTBOX_DIR`), cadastra, cria
   monitoramentos até a cota.
9. **Docs**: Política de Privacidade (dados do convite e o que acontece na
   suspensão), `CLAUDE.md` (mapa da API, models `AccessInvite` e
   `AdminAuditLog`, variáveis), evidência nesta spec.

Gates: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm test:e2e`, build do Docker (`web` e `api`).

## Rollout e rollback

1. Deploy com `INVITE_REQUIRED=false` (nada muda para ninguém).
2. Criar o primeiro admin: `deploy/bin/admin.sh invite --email <owner>` →
   cadastrar → `deploy/bin/admin.sh promote --email <owner>`.
3. Ligar `INVITE_REQUIRED=true` e reiniciar a API.
4. Rollback: `INVITE_REQUIRED=false`. A migração é aditiva; nada é apagado.

## Etapa 2 — automático pela plataforma (rascunho, não aprovado)

- `POST /v1/payments/webhooks/<plataforma>`: confere a autenticidade do aviso
  antes de processar, deduplica pelo id do evento (`PaymentEvent`, único) e
  grava só os campos necessários (sem payload cru, CLAUDE.md §9.2).
- Compra aprovada → mesma criação de chave da Etapa 1 (`createdByUserId =
null`, origem da plataforma), envio por outbox.
- Reembolso, chargeback ou cancelamento → mesma suspensão da Etapa 1 e a
  pessoa entra na lista "tirar do grupo".
- Compra de monitoramentos extras → aumenta a cota do mês (forma depende da
  decisão de cobrança).

| Plataforma   | Eventos confirmados                                                                       | Prova de autenticidade                                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Hotmart      | compra aprovada, reembolsada, chargeback; assinatura cancelada, troca de plano, renovação | token "hottok" — identificadores e forma de envio **não confirmados**; a Hotmart desativa o webhook se a URL responder erro repetidamente |
| Mercado Pago | notificações de pagamento e assinatura                                                    | cabeçalho `x-signature` (HMAC-SHA256 com o segredo do app); o SDK oficial valida                                                          |

Fontes (consultadas em 2026-10-16):
[Hotmart — Webhook (Postback)](https://help.hotmart.com/pt-br/article/como-configurar-sua-api-atraves-do-webhook-postback-/360001491352),
[Mercado Pago — Webhooks](https://www.mercadopago.com/developers/en/docs/your-integrations/notifications/webhooks).
O formato completo dos avisos será conferido com uma compra de teste real
antes do código.

Em aberto para a Etapa 2: cobrança única ou mensal (e, se mensal, se parar de
pagar pausa ou encerra os monitoramentos); qual das duas plataformas; preço e
forma dos monitoramentos extras.

## Evidência de implementação

Preenchida na implementação.
