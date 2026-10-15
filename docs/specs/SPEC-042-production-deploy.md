# SPEC-042 — Deploy de produção num servidor só

Status: implemented — aguardando o servidor (owner contrata) e as contas
Cloudflare e de monitoramento
Owner: Operations
Dependências: SPEC-024 (configuração e trava de produção), SPEC-025
(segredo interno e IP do cliente), SPEC-028 (imagens Docker), SPEC-036
(Resend), SPEC-041 (Turnstile)
Pedido do owner: hospedagem paga, com o domínio `flightwatch.com.br`
(conversa de 2026-10-14/15)

## Objetivo

Um kit que coloca o Flight Watch no ar num servidor Linux qualquer (VPS da
Hetzner, Hostinger, Vultr…) com poucos comandos, seguro por padrão, com
backup testado e atualização em um comando — e que continue igual quando o
projeto mudar de servidor.

## Fora do escopo

- Kubernetes, várias réplicas, banco gerenciado: um servidor basta para o
  beta e o lançamento inicial (CLAUDE.md §3.1, simplicidade operacional).
- Staging separado (dá para subir o mesmo kit em outro servidor depois).
- Observabilidade completa (Prometheus/Grafana): as métricas continuam
  internas; o kit traz o aviso de site fora do ar e logs.

## Desenho

```text
visitante ──HTTPS──▶ Cloudflare ──túnel──▶ cloudflared ─▶ web:3100 ─▶ api:3000
                                                   └──▶ umami:3000 (stats.)
servidor: só a porta 22 (SSH com chave) aberta; nada mais escuta na internet
rede interna do compose: postgres, redis, api, workers, web, umami
```

- **Cloudflare Tunnel** (`cloudflared`): o servidor não abre 80/443; a
  Cloudflare termina o HTTPS e encaminha pelo túnel. Também entrega os
  cabeçalhos da cidade do acesso (SPEC-034) e protege contra ataques.
- **Postgres e Redis** sem porta publicada, com senha; Redis com
  `appendonly` (fila do BullMQ sobrevive a reinício).
- **Imagens**: as da SPEC-028, construídas no próprio servidor a partir do
  repositório (sem registro de imagens por enquanto).
- **Segredos**: só em `deploy/.env.production` no servidor (`chmod 600`,
  fora do git); o modelo `deploy/env.production.example` lista todos.

## Componentes (`deploy/`)

| Arquivo                  | O que faz                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `compose.production.yml` | serviços de produção, rede interna, volumes, `restart: unless-stopped`, healthchecks                      |
| `env.production.example` | todas as variáveis, com os valores de produção e os segredos em branco                                    |
| `bin/setup-server.sh`    | prepara o Ubuntu: usuário, SSH só com chave, firewall (só 22), fail2ban, atualizações automáticas, Docker |
| `bin/update.sh`          | atualiza o site: baixa a `main`, constrói, roda as migrações e reinicia                                   |
| `bin/backup.sh`          | `pg_dump` diário criptografado (AES-256), guarda 14 dias, cópia fora do servidor opcional                 |
| `bin/restore-test.sh`    | restaura o backup mais recente num Postgres descartável e confere as tabelas                              |
| `README.md`              | o passo a passo, do servidor novo ao site no ar, e o que fazer quando algo dá errado                      |

## Medição do beta (Umami)

- Umami 2.20.2 (código aberto, sem cookies, não grava IP) no próprio
  servidor, com banco próprio (`umami`) no mesmo Postgres. O painel do owner
  fica em `stats.flightwatch.com.br`, pelo túnel.
- **Pelo próprio domínio:** o navegador só fala com o site —
  `/stats/script.js` e `/stats/api/send` são route handlers do web que
  repassam ao Umami na rede interna (`UMAMI_INTERNAL_URL=http://umami:3000`).
  A CSP não muda (nenhum domínio de terceiro) e a decisão não depende de
  saber o domínio no build. Sem `UMAMI_INTERNAL_URL`, as rotas respondem 404.
- **Query fora no proxy:** links de confirmação e de nova senha levam token
  na query; o proxy tira query e âncora de `url` e `referrer` antes de
  repassar. Medido: o `data-exclude-search` do script do Umami 2.20.2 só vale
  depois da primeira visita (gravou `token=segredo`) e ainda contava a visita
  em dobro no `replaceState` do Next — por isso a limpeza é no servidor. O
  proxy repassa só user-agent, idioma e os cabeçalhos de localização da
  Cloudflare, nunca cookie; corpo até 16 KB e só JSON.
- O web inclui o script só com `UMAMI_WEBSITE_ID`, que entra **no build**
  (argumento do Dockerfile, declarado no `env` do `build` no `turbo.json`):
  páginas estáticas são geradas no build. Criou o site no Umami → preenche o
  id → `bin/update.sh`. Respeita "Do Not Track" (`data-do-not-track`).
- Eventos do beta: visitas por página (automático) e cliques em "Ver
  oferta" (`ver-oferta`), "Comprar passagem" (`comprar`) e "Criar/Confirmar
  monitoramento" (`criar-monitoramento`), por `data-umami-event`.
- A Política de Privacidade ganha a seção "Estatística de uso".

## Site fora do ar

- `GET /healthz` no web responde 200 só se a API responder `/health` em até
  3 s (sem detalhe nenhum no corpo, CLAUDE.md §11.3).
- Um serviço externo gratuito (ex.: UptimeRobot) consulta essa rota a cada
  5 min e avisa por e-mail — de fora, porque o próprio servidor não avisa
  que caiu.

## Frequência das consultas e cota da fonte

Decisão do intervalo de polling para o beta (CLAUDE.md §1.3 — continua
`PROPOSTO` até medir com tráfego real).

- **Custo de uma verificação:** 1 chamada a `v2/prices/latest` (rota + mês),
  sem custo em dinheiro.
- **Limite da fonte:** 300 chamadas/minuto para `v2/prices/latest`; acima
  disso, 429 e bloqueio até o fim do minuto. A Travelpayouts recomenda
  guardar o resultado por 24 h
  ([API rate limits](https://support.travelpayouts.com/hc/en-us/articles/4402565416594),
  consultado em 2026-10-15).
- **Frescor da fonte:** mediana de ≈ 1 dia de idade do preço (ADR-008).
- **Intervalo mantido: 4 h por SearchTarget** (`DEFAULT_CHECK_INTERVAL_SECONDS`).
  Seis chamadas por rota/dia. Com 1.000 monitoramentos distintos, isso dá
  6 mil chamadas/dia (≈ 4/min em média), muito longe do limite. Mais
  devagar não economiza nada que importe e atrasa o aviso nas rotas
  populares, que mudam várias vezes por dia. O mesmo preço não vira nova
  observação (`price_observation_total{result="unchanged"}`, SPEC-030).
- **O risco é o pico, não o total:** depois de uma subida ou de uma queda,
  o scheduler enfileira tudo o que venceu de uma vez. O price-worker permitia
  5/s (300/min), sozinho no teto, e a API usa o mesmo token para promoções,
  página da rota, calendário e página da oferta. Produção usa
  `PRICE_WORKER_RATE_LIMIT_PER_SECOND=2` e `CAPACITY=5` (120/min), o que deixa
  180/min para a API e ainda cobre ≈ 28 mil SearchTargets a cada 4 h. O
  limitador é por processo: com mais de um price-worker, dividir esse valor
  entre eles.
- **Medir no beta:** a razão `unchanged / (success + unchanged)` em
  `price_observation_total` e os 429 (`provider_call_total{result="RATE_LIMITED"}`). Mais de 90 %
  `unchanged` depois de duas semanas → subir para 6–12 h. Qualquer 429 →
  baixar o ritmo antes de mexer no intervalo.

## Critérios de aceitação

- **AC-1** Com o `.env.production` preenchido, `bin/update.sh` sobe tudo e o
  site responde pelo túnel; nenhuma porta além da 22 fica aberta.
- **AC-2** A API recusa subir sem os segredos de produção (SPEC-024/041).
- **AC-3** `bin/backup.sh` gera um arquivo criptografado; sem a senha ele
  não abre; `bin/restore-test.sh` restaura e confere.
- **AC-4** `GET /healthz` responde 200 com a API de pé e 503 com ela fora.
- **AC-5** Sem as variáveis do Umami, o site não carrega script nenhum de
  terceiros além dos já existentes.

## Testes

- Local (este PC, Docker): subir `compose.production.yml` com
  `APP_ENV=production`, provedores reais e as chaves de teste do Turnstile,
  sem o túnel (porta do web só em 127.0.0.1 por um override de teste);
  backup e teste de restauração de verdade; `/healthz` nos dois estados.
- Web: teste unitário da rota `/healthz`.
- O `setup-server.sh` é verificado no servidor real (não dá para testar
  firewall e SSH aqui sem risco de trancar o PC).

## Rollout e rollback

- Primeiro deploy: seguir o `deploy/README.md`.
- Atualização: `bin/update.sh` (migrações só aditivas; se a nova versão
  falhar no healthcheck, `bin/update.sh <commit anterior>` volta).
- Banco: backup diário; restauração documentada no README.

## Evidência de implementação

Branch `feat/deploy-kit`, testado em 2026-10-15 neste PC (Docker 29, sem o
túnel, `compose.preview.yml` com o web em `127.0.0.1:3200`), com
`APP_ENV=production`, Travelpayouts e Resend reais e as chaves de teste do
Turnstile:

- **AC-1** os 9 serviços sobem saudáveis (`postgres`, `redis`, `migrate`
  concluído, `api`, 4 workers, `web`, `umami`); `docker ps` não mostra porta
  publicada além da do preview em `127.0.0.1`. Redis sem senha:
  `NOAUTH Authentication required`. O `price-worker` sobe com
  `provider: TRAVELPAYOUTS`. Túnel e firewall: só no servidor real.
- **AC-2** `api` com `INTERNAL_API_SECRET` vazio:
  `config_invalid` com a chave (sem valor) e código de saída 1.
- **AC-3** `bin/backup.sh`: `flight_watch-*.dump.enc` (820 KB) e
  `umami-*.dump.enc`, modo 600, conteúdo `Salted__` + binário; com senha
  errada, `bad decrypt`. `bin/restore-test.sh`: `migrações=13` com todas as
  tabelas num Postgres descartável, removido no fim. O primeiro teste achou
  uma falha do próprio script (o servidor temporário de inicialização do
  Postgres responde `pg_isready` e reinicia) — agora espera pela porta TCP.
- **AC-4** `/healthz`: 200 (`ok`) com a API de pé; com a API parada, 503
  (`indisponível`) em 3,0 s; volta a 200 quando a API volta. Teste unitário
  `apps/web/src/lib/health.test.ts`.
- **AC-5** sem `UMAMI_WEBSITE_ID`, a página não tem a tag do script. Com o
  id (site criado pela API do Umami), uma visita em Chromium a
  `/?token=segredo`: `GET /stats/script.js` e `POST /stats/api/send` (200),
  nenhum outro host, nenhum erro no console, e o Umami gravou **uma** visita
  em `/` com `url_query` vazio. Testes `apps/web/src/lib/stats-proxy.test.ts`.
- Achado no caminho: `WEB_BASE_URL` não chegava ao build do web (o Turbo
  filtra variáveis não declaradas), então páginas estáticas e o
  `robots.txt` saíam com `localhost`. Agora é argumento do Dockerfile e está
  no `env` do `build` no `turbo.json`; conferido: `Sitemap:` com o endereço
  configurado.
- Gates: `pnpm format:check`, `pnpm lint`, `pnpm typecheck` (23 tarefas),
  testes do web (120) e do config (45) passaram.
- Não verificado aqui (precisa do servidor): `bin/setup-server.sh`,
  `bin/update.sh` completo (faz `git checkout` da `main`; aqui o build e o
  `up` foram feitos com a mesma função `compose` do script), túnel e
  monitor externo.
