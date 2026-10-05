# 05 — Quality gates do refactor

Estende `CLAUDE.md` §18 e `docs/QUALITY-GATES.md`.
Nada aqui afrouxa um gate de lá. Descubra os scripts reais no `package.json`
antes de rodar; os nomes abaixo foram conferidos em `fa57198`.

## Ordem por tarefa

| #   | Gate               | Comando                                                               | Passa quando                                                    |
| --- | ------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| G0  | escopo             | ficha da tarefa + spec citada no PR                                   | o diff só toca os arquivos da ficha, ou a ficha foi atualizada  |
| G1  | formatação         | `pnpm format:check`                                                   | verde, exceto `apps/web/next-env.d.ts` enquanto P-07 abrir      |
| G2  | lint               | `pnpm lint`                                                           | verde                                                           |
| G3  | tipos              | `pnpm typecheck`                                                      | verde em todos os packages                                      |
| G4  | testes             | `pnpm test` (Docker ligado: a API usa Testcontainers)                 | verde; teste novo da tarefa incluído                            |
| G5  | build              | `pnpm build`                                                          | verde                                                           |
| G6  | design (código)    | `pnpm check:design` (`node scripts/design/check-all.mjs`)             | tudo dentro do teto; tetos que a tarefa melhorou foram baixados |
| G7  | design (navegador) | `node scripts/design/eval-ui.mjs` com o web em produção               | limiares de `04-evals.md`                                       |
| G8  | visual             | screenshots 390 e 1440, antes e depois, das rotas tocadas             | anexados ao registro do eval; rubrica quando a ficha pede       |
| G9  | revisão            | releitura adversarial do diff + checklist `CLAUDE.md` §19 "Front-end" | nenhum item aberto sem justificativa                            |

Durante o trabalho, rode só o package afetado
(`pnpm --filter @flight-watch/web test`, `--filter @flight-watch/domain`), mas
antes de abrir o PR rode o gate global (G1 a G7). Nunca declare verde o que não
rodou: gate não executado vai no PR com o motivo.

## Proibido para chegar ao verde

Herdado de `CLAUDE.md` §18 e §22, repetido porque é onde agente erra:

- desligar regra de lint, `// eslint-disable`, `@ts-ignore`, `any` sem
  justificativa localizada;
- pular, apagar ou enfraquecer teste ou asserção;
- subir teto em `ceilings.json` sem decisão em `09-decisoes.md`;
- adicionar arquivo ao `.prettierignore` ou exceção no `check-*.mjs` para
  esconder problema (a exceção de `themeColor` é a única prevista);
- trocar o eval de navegador por "olhei e parece ok".

## Como subir o sistema para G7 e G8

Com `docker compose up -d` (Postgres e Redis do `docker-compose.yml`):

```bash
pnpm install
pnpm build
export DATABASE_URL="postgresql://flight_watch:flight_watch@localhost:5432/flight_watch"
export REDIS_URL="redis://localhost:6379"
pnpm --filter @flight-watch/database prisma:deploy
pnpm --filter @flight-watch/database prisma:seed     # conta dev-local@example.com, e-mail verificado

# um terminal por processo (ou & com logs em arquivo); métricas em portas distintas
(cd apps/api && node dist/main.js)
(cd apps/scheduler && METRICS_PORT=9101 SCHEDULER_TICK_INTERVAL_MS=5000 node dist/main.js)
(cd apps/price-worker && METRICS_PORT=9102 node dist/main.js)
(cd apps/alert-worker && METRICS_PORT=9103 node dist/main.js)
(cd apps/notification-worker && METRICS_PORT=9104 node dist/main.js)
(cd apps/web && pnpm exec next start --port 3100)
```

Dados para as telas: entre com a conta de desenvolvimento (senha em
`packages/database/prisma/seed.ts`), crie três monitoramentos e uma busca, e
deixe o scheduler rodar alguns minutos com o provider simulado até
`/opportunities` mostrar promoções. Depois:

- `FW_SESSION`: valor do cookie `fw_session` (DevTools → Application →
  Cookies);
- `FW_WATCH_ID` e `FW_SEARCH_ID`: ids das URLs `/watches/:id` e `/search/:id`.

```bash
FW_SESSION=... FW_WATCH_ID=... FW_SEARCH_ID=... \
NODE_PATH=~/.fw-evals/node_modules node scripts/design/eval-ui.mjs --json /tmp/eval-ui.json
```

Sempre avalie o build de produção (`next build` + `next start`): o modo `dev`
mostra erros diferentes e esconde outros.

O Redis grava `dump.rdb` na pasta de onde foi iniciado. Se aparecer na raiz do
repositório, apague; nunca commite.

## Falha pré-existente conhecida

`pnpm format:check` reprova `apps/web/next-env.d.ts` já em `fa57198`: o Next
gera o arquivo com aspas duplas e o regrava a cada `next build`. Não formate à
mão (o próximo build desfaz) e não crie `.prettierignore` sem a decisão P-07.
No PR, escreva "G1 verde exceto next-env.d.ts (pré-existente, P-07)".

## Checklist do PR

Use `templates/pr.md`. O PR só é aberto com G1 a G8 registrados no arquivo de
eval da tarefa e a ficha com a seção "Handoff" preenchida.
