# SPEC-035 — E-mail real pelo Resend

Status: approved (owner, 2026-10-13) — passo 4 do `MVP-CHECKLIST.md`
Owner: Notifications
Dependências: SPEC-006 (entrega de alertas), SPEC-012 (idempotência do
canal), SPEC-024 (configuração e trava de produção), SPEC-026 (recuperação
de senha)

> Numeração: a SPEC-034 está reservada para a vitrine de promoções.

## Objetivo

Os e-mails do sistema (confirmação de cadastro, recuperação de senha e
alertas de preço) passam a ser entregues de verdade, pelo Resend, atrás da
porta `EmailSender` que já existe. O resto do sistema não muda.

## Fora do escopo

- e-mail em HTML (continua só texto; ver "Rastreio de cliques");
- receber e-mails (o domínio só envia);
- webhooks de entrega/bounce do Resend (próxima evolução: marcar canal com
  bounce definitivo);
- WhatsApp e outros canais.

## Configuração

| Variável                    | Padrão      | Regra                                                                                        |
| --------------------------- | ----------- | -------------------------------------------------------------------------------------------- |
| `EMAIL_PROVIDER`            | `simulated` | ganha o valor `resend`; `simulated` continua proibido com `APP_ENV=production` (SPEC-024)    |
| `RESEND_API_KEY`            | —           | segredo; **obrigatório** com `EMAIL_PROVIDER=resend` (mesmo padrão do `TRAVELPAYOUTS_TOKEN`) |
| `EMAIL_FROM`                | —           | **obrigatório** com `resend`; ex.: `Flight Watch <avisos@avisos.flightwatch.com.br>`         |
| `EMAIL_PROVIDER_TIMEOUT_MS` | `10000`     | timeout de cada envio                                                                        |

Valem para a API (cadastro e senha) e para o notification-worker (alertas).

**Antes do domínio verificado** (modo de teste do Resend): `EMAIL_FROM` =
`Flight Watch <onboarding@resend.dev>` e o Resend só entrega para o e-mail
da própria conta; qualquer outro destino é recusado (ver "Erros").

## Comportamento do adapter (`ResendEmailSender`)

- `POST https://api.resend.com/emails` com `Authorization: Bearer`,
  corpo `{ from, to, subject, text }` e a chave da porta no header
  `Idempotency-Key` (verificado na documentação do Resend em 2026-10-13).
- Sucesso devolve `{ id }` → `providerMessageId`.
- **Idempotência (SPEC-012):** a mesma chave dentro de 24 h devolve o e-mail
  já enviado, sem novo envio. Chave com mais de 256 caracteres (limite do
  Resend) vira o SHA-256 dela. **Limite conhecido:** após 24 h o Resend
  esquece a chave; a reconciliação de `SENDING` preso do worker atua em
  minutos, bem antes disso.
- Sem SDK: `fetch` nativo, para não acrescentar dependência.

### Erros → classe da porta

| Resposta do Resend                                                    | Classe                   | Retenta? | Por quê                                                                                                                                         |
| --------------------------------------------------------------------- | ------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| timeout / falha de rede                                               | `TIMEOUT`                | sim      | transitório                                                                                                                                     |
| 429 (`rate_limit_exceeded`, cotas diária/mensal)                      | `RATE_LIMITED`           | sim      | volta depois                                                                                                                                    |
| 409 `concurrent_idempotent_requests`                                  | `TEMPORARY_UNAVAILABLE`  | sim      | o envio original ainda está em curso                                                                                                            |
| 5xx                                                                   | `TEMPORARY_UNAVAILABLE`  | sim      | indisponibilidade                                                                                                                               |
| 401/403 (chave inválida/suspensa, domínio não verificado, modo teste) | `PROVIDER_CONFIGURATION` | **sim**  | erro **nosso**, não do destinatário: retentar dá tempo de corrigir a configuração sem perder o alerta; log `email_provider_configuration_error` |
| 400/422 (pedido inválido) e 409 `invalid_idempotent_request`          | `REJECTED`               | não      | repetir não resolve                                                                                                                             |

`PROVIDER_CONFIGURATION` e `REJECTED` são classes novas; nenhuma desativa o
canal do usuário (o worker só marca aquele alerta). `PERMANENT_BOUNCE` fica
para quando houver webhook de bounce.

### Rastreio de cliques

O domínio no Resend foi criado com "click tracking" travado como ligado.
Como os e-mails são só texto, os links não são reescritos. **Desligar o
rastreio antes de enviar HTML** (redirecionamento extra pode atrapalhar a
atribuição de afiliado e piora a entregabilidade).

## Segurança e privacidade

- A chave só no ambiente (`.env`, secret manager); nunca em log, erro ou
  teste. Mensagem de erro do adapter nunca inclui a chave nem o destinatário.
- Chave com permissão só de envio ("Sending access").
- Logs com o id opaco do Resend, nunca o e-mail completo (CLAUDE.md §11.1).

## Critérios de aceitação

- **AC-1** `EMAIL_PROVIDER=resend` sem `RESEND_API_KEY` ou sem `EMAIL_FROM`
  não sobe (`config_invalid`).
- **AC-2** Envio manda `from`, `to`, `subject`, `text`, `Authorization` e
  `Idempotency-Key`; devolve o id do Resend.
- **AC-3** Chave de idempotência > 256 caracteres vira SHA-256 (estável).
- **AC-4** Cada linha da tabela de erros gera a classe certa.
- **AC-5** Timeout configurável vira `TIMEOUT`.
- **AC-6** Nenhuma mensagem de erro ou log contém a chave ou o destinatário.
- **AC-7** Execução real: um alerta de queda de preço gerado pelo sistema
  chega em `app.flightwatch@gmail.com` (modo de teste do Resend).

## Testes

Unitários do adapter com `fetch` falso (sucesso, headers, cada erro,
timeout, chave longa); config (AC-1); factory; execução real (AC-7).

## Rollout e rollback

Sem migração. Liga com `EMAIL_PROVIDER=resend`; volta com
`EMAIL_PROVIDER=simulated` (fora de produção). Domínio próprio: só trocar
`EMAIL_FROM` depois da verificação do DNS no Resend.

## Evidência de implementação

2026-10-13, branch `feat/resend-email` (sobre `feat/route-page`).

- Adapter `ResendEmailSender` (17 testes com `fetch` falso: corpo, headers,
  idempotência, cada linha da tabela de erros, timeout, falha de rede, sem
  chave/destinatário nas mensagens), factory (3), config (5: obrigatoriedade
  com `resend`, formato do remetente sem ecoar o valor). Notifications 37,
  config 46, notification-worker 13; lint 14/14, typecheck 22/22.
- Documentação do Resend conferida antes do código: endpoint, `Idempotency-Key`
  (24 h, até 256 caracteres; mesma chave devolve o envio já feito), erros e
  limite de 10 req/s por time.
- **Execução real (AC-7)**, modo de teste do Resend (`onboarding@resend.dev`),
  sistema local com Travelpayouts:
  - cadastro de `app.flightwatch@gmail.com` → e-mail de confirmação chegou;
  - confirmação pelo link → monitoramento com preço desejado acima do preço
    observado → alerta de preço chegou (owner confirmou);
  - banco: entrega `DELIVERED` com id do Resend; nenhum
    `notification_delivery_failed` nem `email_provider_configuration_error`.
- **Achado:** o e-mail de confirmação caiu no spam do Gmail. Causa principal:
  remetente de teste compartilhado (`onboarding@resend.dev`) + link para
  `localhost`. Correção prevista: domínio próprio com SPF/DKIM/DMARC
  (passo 7 do checklist) e, depois, versão HTML + `List-Unsubscribe` nos
  alertas.
