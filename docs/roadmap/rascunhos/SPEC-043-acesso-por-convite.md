# SPEC-043 — Cadastro só com chave de convite (acesso pago)

Status: draft — aguardando as decisões do owner (§ Decisões em aberto)
Owner: Identity
Dependências: SPEC-007/ADR-006 (cadastro e sessão), SPEC-025 (rate limit por
IP do cliente), SPEC-036 (Resend), SPEC-041 (Turnstile)
Origem: conversa de 2026-10-16; modelo de negócio em
`assinatura-convite-whatsapp.md` (mesma pasta)

> Muda o cadastro: exige aprovação explícita do owner antes de implementar
> (CLAUDE.md §21 — mudança de autenticação/autorização).

## Objetivo

Só quem comprou o acesso ao grupo pago consegue criar conta no Flight Watch.
A compra gera uma **chave de convite** de uso único, ligada ao e-mail de quem
pagou; o cadastro exige e-mail + senha + chave.

Por que: limitar o beta a poucas pessoas que já pagaram — teste controlado e
caixa desde o começo.

## Fluxo

```text
Instagram → grupo grátis → compra na plataforma de pagamento
                                     │ pagamento aprovado
                                     ▼  (webhook — Etapa 2)
                 Flight Watch gera a chave e manda por e-mail
                                     │
           cadastro no site: e-mail (o da compra) + senha + chave
```

O grupo de WhatsApp é gerenciado pelo owner, fora do sistema. O sistema só
fornece a lista de quem perdeu o acesso (reembolso/cancelamento), para tirar
do grupo à mão.

## Fora do escopo

- Gerenciar membros do WhatsApp (a API oficial não faz isso; bibliotecas não
  oficiais violam os termos e arriscam banir o número).
- Checkout próprio, dados de cartão (nunca guardados — só id, status e
  e-mail do pagamento, vindos da plataforma).
- Painel web de administração (não existe papel de admin; ver Etapa 1).
- Fechar as páginas públicas: promoções, rotas, calendário e "Ver oferta"
  continuam abertas (vitrine e SEO). Só o que exige conta fica restrito.

## Etapa 1 — chaves geradas à mão (plano B, primeiro a sair)

- Comando no servidor (só quem tem SSH): `deploy/bin/invite.sh create
--email pessoa@x.com [--plan basico] [--days 30]` → imprime a chave **uma
  vez** e, opcionalmente, envia o e-mail com ela.
- `invite.sh list` (estado de cada chave, sem a chave) e `invite.sh revoke`.
- Suficiente para as primeiras 10–20 vendas: o owner confere o pagamento na
  plataforma e gera a chave.

## Etapa 2 — automático pela plataforma (webhook)

- `POST /v1/payments/webhooks/<plataforma>`: confere a autenticidade do aviso
  **antes** de ler o corpo, deduplica pelo id do evento (a plataforma pode
  reenviar) e grava o evento cru só com os campos necessários.
- Compra aprovada → cria a chave e envia por e-mail (outbox, como os alertas:
  nada de enviar e-mail dentro da requisição do webhook).
- Reembolso, chargeback ou assinatura cancelada → acesso suspenso
  (comportamento depende da decisão 1) e a pessoa entra na lista de "tirar do
  grupo".

### O que já se sabe das plataformas (pesquisado em 2026-10-16)

| Plataforma   | Eventos confirmados na documentação                                                                                                    | Como provar que o aviso é verdadeiro                                                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kiwify       | `compra_aprovada`, `compra_reembolsada`, `chargeback`, `subscription_canceled`, `subscription_late`, `subscription_renewed` (e outros) | webhook tem um `token` na configuração; **como ele chega no aviso não está na página pública** — confirmar no painel/suporte antes de implementar         |
| Hotmart      | compra aprovada, reembolsada, chargeback; assinatura cancelada, troca de plano, renovação                                              | token "hottok" — **identificadores exatos e envio não confirmados** na pesquisa; a Hotmart desativa o webhook se a nossa URL responder erro repetidamente |
| Mercado Pago | notificações de pagamento e assinatura                                                                                                 | cabeçalho `x-signature` (HMAC-SHA256 com o segredo do app, sobre id, request-id e ts); o SDK oficial já valida                                            |

Fontes: [Kiwify — criar webhook](https://docs.kiwify.com.br/api-reference/webhooks/create),
[Kiwify — ajuda sobre webhooks](https://help.kiwify.com/en/article/understanding-webhook-functionality-15to8j/),
[Hotmart — Webhook (Postback)](https://help.hotmart.com/pt-br/article/como-configurar-sua-api-atraves-do-webhook-postback-/360001491352),
[Mercado Pago — Webhooks](https://www.mercadopago.com/developers/en/docs/your-integrations/notifications/webhooks).
Formato completo dos avisos (campo do e-mail do comprador, id do pedido) não
está nas páginas públicas: será conferido com um aviso de teste real da
plataforma escolhida antes do código.

## Chave de convite (comum às duas etapas)

- Aleatória (`randomBytes`, CSPRNG), 25 caracteres de um alfabeto sem
  ambíguos (base32 Crockford, sem 0/O, 1/I/L) ≈ 125 bits, em grupos de 5
  para digitar: `K7QMX-4XTP9-HRC2W-VAN6D-J3QEZ`. O site aceita com ou sem
  hífen, maiúsculas ou minúsculas.
- No banco fica **só o hash**, com o mesmo `hashOpaqueToken` (SHA-256) da
  sessão e da redefinição de senha (`apps/api/src/auth/opaque-token.ts`); o
  gerador de lá (base64url, 43 caracteres) não serve para digitar. A chave em
  claro existe só no e-mail ou no terminal.
- **Uso único**, com trava na transação do cadastro (duas abas ao mesmo tempo
  → só uma conta).
- **Ligada ao e-mail da compra**: cadastro só aceita a chave junto com o
  mesmo e-mail (comparação normalizada). Impede repassar a chave.
- Validade (padrão 30 dias, configurável); estados: `AVAILABLE`, `REDEEMED`,
  `EXPIRED`, `REVOKED`.
- Erro genérico no cadastro ("chave inválida ou já usada") — não revela se a
  chave existe, se venceu ou de quem é.
- Tentativas limitadas por IP (throttler `auth` da SPEC-025) + Turnstile
  (SPEC-041), que já cobrem o cadastro.

## Modelo de dados (rascunho)

- `AccessInvite`: id, `codeHash` (único), `email` normalizado, `plan`,
  `status`, `expiresAt`, `redeemedAt`, `redeemedByUserId`, `source`
  (`MANUAL` | plataforma), `externalOrderId` (único por plataforma),
  `createdAt`.
- `PaymentEvent` (Etapa 2): id do evento na plataforma (único — idempotência),
  tipo, `externalOrderId`, recebido em, resultado do processamento. Sem
  payload cru (CLAUDE.md §9.2).
- `User` ganha `accessStatus` (`ACTIVE` | `SUSPENDED`) e `plan`.
  Migração aditiva; contas existentes recebem o valor da decisão 4.

## Limite de monitoramentos

Já existe `WATCH_LIMIT_REACHED` na criação de Watch, com limite fixo de 20
ativos por usuário (`MAX_ACTIVE_WATCHES_PER_USER`,
`apps/api/src/watches/watches.service.ts`). Passa a ler o limite do plano do
usuário, e o site mostra "3 de 5
monitoramentos" (barra de uso, `POST-MVP-VISION.md` §4.5).

## LGPD e consumidor

- Política de Privacidade: plataforma de pagamento (o que recebemos dela), o
  que acontece com a conta no fim do acesso, prazo de guarda.
- CDC art. 49: 7 dias de arrependimento — o reembolso (Etapa 2) ou o
  `invite.sh revoke` + suspensão (Etapa 1) precisa cortar o acesso.
- Promoções no WhatsApp são marketing: consentimento explícito e saída fácil
  (fora do sistema, mas registrado na política).
- E-mail da chave é transacional; não leva propaganda.

## Observabilidade

- `access_invites_total{source,result}` — `created`, `redeemed`, `rejected`
  (`invalid`, `expired`, `email_mismatch`, `already_used`, só na métrica,
  nunca na resposta), `revoked`.
- `payment_webhooks_total{platform,result}` — `processed`, `duplicate`,
  `bad_signature`, `ignored_event`.
- Logs com ids opacos; nunca a chave, o e-mail completo nem o payload.

## Critérios de aceitação (rascunho)

- AC-1 Sem chave, ou com chave inválida, vencida, revogada ou já usada: o
  cadastro falha com a mesma mensagem genérica.
- AC-2 Chave válida com outro e-mail: falha (mesma mensagem).
- AC-3 Dois cadastros simultâneos com a mesma chave: exatamente uma conta.
- AC-4 O banco não contém a chave em claro.
- AC-5 Login, redefinição de senha e páginas públicas não mudam.
- AC-6 (Etapa 2) Aviso com assinatura errada: 401 e nada gravado; o mesmo
  aviso duas vezes: uma chave só.
- AC-7 (Etapa 2) Reembolso: monitoramentos pausados e pessoa na lista de
  saída do grupo.
- AC-8 Kill switch: `INVITE_REQUIRED=false` volta ao cadastro aberto.

## Rollout

1. Etapa 1 com `INVITE_REQUIRED=true` no beta.
2. Etapa 2 depois de um aviso de teste real da plataforma escolhida.
3. Rollback: `INVITE_REQUIRED=false` (nenhum dado é apagado).

## Decisões em aberto (owner)

1. Cobrança única ou mensal? Mensal: ao parar de pagar, os monitoramentos
   **pausam** (voltam se pagar de novo) ou **acabam**?
2. Plataforma: Kiwify, Hotmart ou Mercado Pago?
3. Limite: quantos monitoramentos **ativos ao mesmo tempo** por pagante?
   Um plano só ou mais de um?
4. Contas que já existem (owner e testes): continuam valendo sem chave?
5. Validade da chave antes de ser usada: 30 dias está bom?
6. Começar pela Etapa 1 (chave à mão) e fazer a Etapa 2 depois?
