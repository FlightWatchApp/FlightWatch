# Eval A3 — 2026-09-30

Branch: `main` · Quem rodou: Claude Code (agente)

## Plano

- Objetivo: um só componente de compra (`PurchaseButton`, `rel="...
sponsored"`), `PurchaseNote` em toda página com compra, aviso no rodapé,
  página `/transparencia`. Sem redesenhar cartões — só troca o link e
  acrescenta o aviso.
- Arquivos permitidos: `apps/web/src/components/purchase/**` (novo),
  `apps/web/src/app/transparencia/**` (novo), `site-footer.tsx`,
  `watch-card.tsx`, `purchase-link-button.tsx` (removido),
  `watches/[id]/page.tsx`, `opportunities/opportunity-card.tsx`+`page.tsx`,
  `search/[id]/offer-card.tsx`+`page.tsx`, `app/page.tsx`, `ceilings.json`.
- Riscos: nenhum contrato de API muda; risco real encontrado durante a
  tarefa (ver "Revisão adversarial").
- Red escolhido: `pnpm check:design` com `compraSemSponsored`,
  `paginaSemAvisoComissao`, `semPaginaTransparencia` e `frasesProibidas`
  acima do teto que a tarefa deveria baixar.

## Red

```text
$ pnpm check:design   # antes da tarefa
frasesProibidas             8  (teto 8)
compraSemSponsored          3  (teto 3)
paginaSemAvisoComissao      4  (teto 4)
semPaginaTransparencia      1  (teto 1)
```

## Depois

```text
$ pnpm check:design
OK*  frasesProibidas             7  (teto 7, meta 0)   # só "garantido" corrigido; "preço-alvo" fica para outra tarefa
OK*  corForaDosTokens            1  (teto 1, meta 0)    # sem mudança
OK*  contrasteAbaixo             6  (teto 6, meta 0)    # sem mudança
OK   compraSemSponsored          0  (teto 0, meta 0)
OK   paginaSemAvisoComissao      0  (teto 0, meta 0)
OK   semPaginaTransparencia      0  (teto 0, meta 0)
Todas as métricas dentro do teto.

$ pnpm --filter @flight-watch/web typecheck   # verde
$ pnpm --filter @flight-watch/web lint        # verde
$ pnpm --filter @flight-watch/web test        # 14 testes, sem mudança (tarefa não mexeu em lib/domain)
$ pnpm --filter @flight-watch/web build       # verde, /transparencia agora aparece na rota gerada

$ npx turbo run test --concurrency=1   # 20/20 tasks verdes (repo inteiro)
```

`eval-ui.mjs` (sistema local real, Postgres/Redis via Docker, 6 processos +
`next start` produção, Playwright fora do repo):

```text
Antes (F0.2):  console=6  overflow=13  texto<12=6  alvo<24=27  ctrl<44=24
Depois (A3):   console=0  overflow=13  texto<12=6  alvo<24=23  ctrl<44=24
```

`console` zerou (as 3 larguras de `/transparencia` paravam de dar 404).
`alvo<24` melhorou em 4 (os links de compra, antes `<a>` soltos com altura
inconsistente, agora usam `buttonStyles` com altura mínima). `ctrl<44` ficou
**igual** ao teto (24) — ver abaixo, foi preciso uma correção no meio da
tarefa para não piorar. `overflow`/`texto<12` seguem fora do escopo de A3
(catalogados para a fase V).

Exit code do `eval-ui.mjs` continua 1 — não por regressão, mas porque
`overflow`/`texto<12`/`alvo<24` são regras duras (limiar 0) que a fase V
ainda não corrigiu; nenhuma delas piorou.

## Gates

| Gate | Resultado             | Observação                                                                                |
| ---- | --------------------- | ----------------------------------------------------------------------------------------- |
| G1   | verde                 | exceto `next-env.d.ts` (pré-existente, P-07)                                              |
| G2   | verde                 | `eslint src`                                                                              |
| G3   | verde                 | `tsc`, incluindo o ajuste de `exactOptionalPropertyTypes` (ver abaixo)                    |
| G4   | verde                 | 20/20 tasks do monorepo (rodado com `--concurrency=1`, ver observação)                    |
| G5   | verde                 | `pnpm build`, `/transparencia` aparece nas rotas geradas                                  |
| G6   | verde                 | `pnpm check:design`, 3 tetos baixados a 0, 1 teto baixado (7)                             |
| G7   | vermelho, com melhora | `eval-ui.mjs` segue com regras duras fora do escopo de A3 (ver acima); nada regrediu      |
| G8   | feito                 | screenshots depois em `docs/design-refactor/evals/a3-after/` (antes em `evals/baseline/`) |

**Observação de ambiente (não específica desta tarefa)**: `pnpm test` /
`turbo run test` com concorrência padrão (>1) derruba alguns pacotes com
`Hook timed out` — múltiplos Testcontainers (Postgres) sobem ao mesmo tempo e
o Docker local (15 GB RAM, ~9 GB já em uso) entra em swap. Rodar
`npx turbo run test --concurrency=1` resolve de forma determinística; vale
para todas as tarefas seguintes desta sessão.

## Métricas

| Métrica                  | Antes (F0.2) | Depois (A3) |                  Teto novo |
| ------------------------ | -----------: | ----------: | -------------------------: |
| `frasesProibidas`        |            8 |           7 |                          7 |
| `compraSemSponsored`     |            3 |           0 |                          0 |
| `paginaSemAvisoComissao` |            4 |           0 |                          0 |
| `semPaginaTransparencia` |            1 |           0 |                          0 |
| `console` (eval-ui)      |            6 |           0 |           sem teto próprio |
| `alvo<24` (eval-ui)      |           27 |          23 |           sem teto próprio |
| `ctrl<44` (eval-ui)      |           24 |          24 | **24 (mantido, ver nota)** |

## Screenshots

Depois: `docs/design-refactor/evals/a3-after/{inicio,promocoes,resultado,transparencia,painel,detalhe}-{390,1440}.png`.
Antes: os mesmos nomes de rota em `docs/design-refactor/evals/baseline/`.

## Revisão adversarial

1. Frase proibida/promessa quebrada? Corrigida a única do escopo desta
   tarefa ("não garantido" → "pode mudar até a confirmação no site
   parceiro"); as 7 ocorrências de "preço-alvo" ficam fora do escopo (CP-06/
   PG-09/BR-04 não pedem, e a própria ficha limita o Red a 8→7).
2. Preço sem idade ou sem-oferta como zero? Não tocado nesta tarefa.
3. Data/hora sem fuso fixo num client component? Não tocado.
4. Animação de CSS Module com nome de keyframe global? N/a — nenhuma
   animação nova.
5. Link de compra fora do `PurchaseButton` ou página sem `PurchaseNote`?
   Verificado pelo próprio `check-purchase.mjs`: 0 em ambas as métricas.
6. Cor nova fora de `tokens.css` ou par de contraste novo fora de `PAIRS`?
   Não — `page.module.css` de `/transparencia` só usa tokens já existentes
   (evitei `--color-route-text`, que o próprio `check-contrast.mjs` já
   reporta como "token ausente" desde a linha de base — não adicionei um
   uso novo de um token que nem existe).
7. 320px/teclado/movimento reduzido? **Achado real, corrigido na própria
   tarefa**: trocar o `<a>` solto por `PurchaseButton` fez esses links
   passarem a usar `buttonStyles.button`, e o eval de navegador passou a
   contá-los como "controle" (antes eram só `<a>`, sujeitos só ao mínimo de
   24 px; agora, por parecerem botão, ao mínimo de 44 px). Com
   `size="sm"` (36 px) isso teria subido `ctrl<44` de 24 para 28 — um
   retrocesso que a catraca proíbe sem decisão registrada. Corrigido
   usando o tamanho padrão `md` (44 px) nos dois cartões tocados
   (`opportunity-card.tsx`, `offer-card.tsx`); `watch-card.tsx` já usava
   `sm` antes desta tarefa (não piorou, não mudei). Teclado/leitor de tela
   não testados manualmente aqui (EVAL-UI-A11Y-001 é tarefa própria), mas o
   `visually-hidden` com "(abre o site parceiro em nova aba)" foi mantido
   do padrão já existente em `purchase-link-button.tsx`.
8. Diff tocando arquivo fora da ficha? Não — todos os arquivos tocados estão
   na lista de "Arquivos permitidos"; `ceilings.json` foi atualizado como a
   própria ficha manda.

## Pendência técnica descoberta (não desta tarefa)

`exactOptionalPropertyTypes: true` no `tsconfig.json` do web exige que uma
prop opcional `string | undefined` seja espalhada condicionalmente
(`{...(cond ? {prop: x} : {})}`) em vez de `prop={cond ? x : undefined}` —
ajustado em `offer-card.tsx` para `PurchaseButton`'s `context`. Documentado
aqui como precedente para as próximas tarefas que passam props opcionais
condicionalmente.

## Handoff

- Alterações: `components/purchase/{purchase-button,purchase-note}.tsx`
  (+`.module.css`) novos; `app/transparencia/{page.tsx,page.module.css}`
  novos; `watch-card.tsx`, `watches/[id]/page.tsx`,
  `opportunities/opportunity-card.tsx`, `opportunities/page.tsx`,
  `search/[id]/offer-card.tsx`, `search/[id]/page.tsx`, `app/page.tsx`,
  `site-footer.tsx` editados; `watches/purchase-link-button.tsx` removido;
  `scripts/design/ceilings.json` (2 tetos baixados).
- Evidências: saída real acima; screenshots antes/depois.
- Limitações e riscos: nenhum além do já registrado (achado #7, corrigido
  na própria tarefa).
- Próximo passo: fase V (fundação visual) — V1 (tokens/fontes/movimento),
  nível 1.
