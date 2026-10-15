# SPEC-041 — Captcha (Cloudflare Turnstile) no cadastro, login e senha

Status: implemented — chaves reais pendentes (conta Cloudflare do owner)
Owner: Identity
Dependências: SPEC-007 (cadastro e login), SPEC-025 (IP do cliente e rate
limit `auth`), SPEC-026 (recuperação de senha), SPEC-037 (Privacidade)
Pedido do owner: lista de segurança antes de abrir ao público (2026-10-15)

## Objetivo

Com o site público, robôs criam contas em massa, testam senhas e disparam
e-mails de recuperação. O rate limit por IP (SPEC-025) segura quem vem de um
IP só; o captcha segura quem distribui as tentativas. Usamos o **Cloudflare
Turnstile**: grátis, sem quebra-cabeça na maioria dos casos e já na mesma
conta do domínio.

## Fora do escopo

- Captcha em outras rotas (busca, monitoramento): continuam com rate limit.
- Detecção de bots por outros sinais (WAF, regras da Cloudflare).

## Comportamento

### Onde

`POST /v1/auth/register`, `POST /v1/auth/login` e
`POST /v1/auth/password-reset/request` aceitam o campo opcional
`captchaToken`. O web mostra o widget nos três formulários.

### Verificação (na API — a fronteira de segurança)

- A API chama `https://challenges.cloudflare.com/turnstile/v0/siteverify`
  com o segredo, o token e o IP do cliente (SPEC-025), timeout de 5 s.
- **Ligado** quando `TURNSTILE_SECRET_KEY` está configurada:
  - sem token → `400 CAPTCHA_REQUIRED`;
  - token recusado pela Cloudflare → `400 CAPTCHA_FAILED`;
  - Cloudflare fora do ar ou timeout → **deixa passar** e registra
    `captcha_unavailable` (o rate limit continua valendo). Bloquear todo
    cadastro e login por falha de terceiro seria pior que o risco.
- **Desligado** sem a variável (desenvolvimento, testes e e2e): o campo é
  ignorado.
- Com `APP_ENV=production`, a API **não sobe** sem `TURNSTILE_SECRET_KEY`
  (mesma regra dos provedores reais, SPEC-024).
- A verificação vem **antes** de qualquer consulta ao banco: robô não gasta
  hash de senha nem envia e-mail.

### Web

- O widget só aparece com `TURNSTILE_SITE_KEY` (lida no servidor, não é
  `NEXT_PUBLIC_*`: troca sem recompilar a imagem). Sem ela, os formulários
  ficam como hoje.
- O botão de enviar só habilita depois do token; token expirado ou erro do
  widget mostra "Confirme que você não é um robô" e reinicia o widget.
- CSP: `script-src` e `frame-src` com `https://challenges.cloudflare.com`.

## Configuração

| Variável               | Processo | Padrão | Observação                       |
| ---------------------- | -------- | ------ | -------------------------------- |
| `TURNSTILE_SECRET_KEY` | api      | vazio  | segredo; obrigatório em produção |
| `TURNSTILE_SITE_KEY`   | web      | vazio  | pública (vai para o navegador)   |

Chaves de teste oficiais da Cloudflare (sempre aprovam): site
`1x00000000000000000000AA`, segredo `1x0000000000000000000000000000000AA`.

## Privacidade

A Cloudflare já está na Política de Privacidade (rede de entrega). O texto
passa a citar também o captcha nos formulários de conta.

## Observabilidade

`auth_captcha_total{result}` — `passed`, `missing`, `failed`,
`unavailable`. Nunca o token nem o IP.

## Critérios de aceitação

- **AC-1** Com o segredo configurado, cadastro, login e pedido de nova senha
  sem token respondem `400 CAPTCHA_REQUIRED`, sem tocar o banco.
- **AC-2** Token recusado → `400 CAPTCHA_FAILED`; aprovado → fluxo normal.
- **AC-3** Cloudflare fora → a requisição segue e a métrica registra
  `unavailable`.
- **AC-4** Sem o segredo, tudo funciona como antes (e2e sem mudança).
- **AC-5** `APP_ENV=production` sem `TURNSTILE_SECRET_KEY` impede o startup.
- **AC-6** Com a chave do site, os três formulários mostram o widget e só
  enviam com token.

## Testes

- API (e2e, Postgres real, verificador falso): AC-1 a AC-4.
- Config: AC-5.
- Web: navegador com as chaves de teste oficiais (widget aparece, token
  chega, cadastro conclui).

## Rollout e rollback

Liga ao configurar as duas chaves; desliga removendo-as (em produção, só
trocando `APP_ENV`, por desenho). Sem migração.

## Evidência de implementação

2026-10-15, branch `feat/turnstile`.

- Config: `TURNSTILE_SECRET_KEY` na API; obrigatória com `APP_ENV=production`
  (`PRODUCTION_REQUIRED_KEYS` em `load.ts`); `TURNSTILE_SITE_KEY` lida pelo
  web — 1 teste novo (AC-5), 46/46.
- Contratos: `captchaToken` opcional nos três pedidos — 2 testes.
- API: `TurnstileVerifier` (siteverify, timeout 5 s), `CaptchaGuard` antes da
  validação e do banco, métrica `auth_captcha_total{result}` — 3 testes do
  verificador e 3 e2e (sem token, recusado, aprovado, Cloudflare fora, login
  e nova senha; usuário não criado quando recusa). API 219/219.
- Web: widget nos três formulários (página do servidor lê a chave do site a
  cada requisição; o token vale uma vez e o widget recomeça a cada
  tentativa); CSP com `challenges.cloudflare.com` em `script-src` e
  `frame-src`; Política de Privacidade cita o captcha.
- E2E 15/15 com o captcha desligado (AC-4).
- Navegador com as chaves de teste oficiais e a Cloudflare real: widget
  aparece em cadastro, entrada e nova senha; botão só habilita com o token;
  cadastro concluído com o token conferido pela API
  (`auth_captcha_total{result="passed"} 1`); sem violação de CSP nem erro.
- **Pendente**: chaves reais (conta Cloudflare do owner), no deploy.
