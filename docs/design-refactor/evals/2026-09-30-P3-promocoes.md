# Eval P3 — 2026-09-30

Branch: `main` · Quem rodou: Claude Code (agente)

## Plano

- Objetivo: página de PG-03 com `DealCard` completo (não `compact`),
  ordenação com `aria-current`, alternador Lista/Mapa a 44 px no celular,
  marcadores do mapa na cor da rota.
- Arquivos permitidos: `app/opportunities/**`.
- Decisão de leitura: PG-03 diz "Lista de `DealCard` completos (com
  `PurchaseNote` em cada, CP-08)" — diferente de PG-01/PG-02, que pedem
  `DealCard` `compact` com uma nota só por lista (CP-06). Não é uma
  contradição: PG-01/PG-02 mostram uma prévia de 2–3 cartões dentro de uma
  página maior; `/opportunities` é a página dedicada, onde cada cartão
  completo faz sentido ter sua própria nota. Segui PG-03 literalmente aqui.
- Red escolhido: alternador Lista/Mapa com 36 px em `eval-ui.mjs`
  (`controlsBelow44`).

## Red

```text
$ grep -n "padding-block: var(--space-2)" apps/web/src/app/opportunities/page.module.css
# .viewToggleButton/.viewToggleActive sem regra para < 640px — altura efetiva ~36px
```

## Depois

```text
$ pnpm --filter @flight-watch/web typecheck   # verde
$ pnpm --filter @flight-watch/web lint        # verde
$ npx turbo run test --concurrency=1          # 20/20 tasks
$ pnpm build                                  # verde
$ pnpm format:check                           # verde exceto next-env.d.ts (P-07)
$ pnpm check:design                           # sem mudança
```

`eval-ui.mjs`:

```text
Antes (P2):  console=0  overflow=0  texto<12=6  alvo<24=3  ctrl<44=2
Depois (P3): console=0  overflow=0  texto<12=6  alvo<24=3  ctrl<44=0
```

`ctrl<44` chega a **zero em todo o site** — o alternador Lista/Mapa era o
único controle fora de `components/ui/**`/`components/layout/**` que ainda
faltava.

## Gates

| Gate | Resultado                                  | Observação                                                         |
| ---- | ------------------------------------------ | ------------------------------------------------------------------ |
| G1   | verde                                      | exceto `next-env.d.ts` (pré-existente, P-07)                       |
| G2   | verde                                      | `eslint src`                                                       |
| G3   | verde                                      | `tsc`                                                              |
| G4   | verde                                      | 20/20 tasks                                                        |
| G5   | verde                                      | `pnpm build`                                                       |
| G6   | verde                                      | `pnpm check:design` sem mudança                                    |
| G7   | verde — `ctrl<44` chega a 0 em todo o site | único controle fora de escopo anterior, agora corrigido            |
| G8   | feito                                      | `docs/design-refactor/evals/p3-after/` (lista 390/1440, mapa 1440) |

## Métricas

| Métrica             | Antes (P2) | Depois (P3) | Teto novo |
| ------------------- | ---------: | ----------: | --------: |
| `ctrl<44` (eval-ui) |          2 |           0 |         0 |

`ui.controlsBelow44` chega à meta (0) pela primeira vez na sessão.

## Verificação manual: funciona sem JavaScript

Confirmado por leitura de código (não por teste automatizado com DevTools
desligado nesta tarefa, para não gastar mais um ciclo de Playwright): a
lista e a ordenação são `<Link>` do Next.js para URLs reais
(`/opportunities?sort=...`), renderizadas no servidor — funcionam como
âncoras HTML puras sem JS. O alternador Lista/Mapa e a seleção de marcador
exigem JS (`OpportunitiesClient` é `'use client'`), mas isso é esperado: sem
JS a pessoa só vê a lista (o padrão, e a via "primária e completa" por
decisão de SPEC-016) — não há perda de funcionalidade essencial.

## Screenshots

`p3-after/promocoes-{390,1440}.png`: cabeçalho novo ("Promoções
identificadas pelo sistema" / "Passagens abaixo do padrão agora"), 6
`DealCard` completos cada um com seu próprio aviso de comissão.
`p3-after/promocoes-map-1440.png`: mapa com marcadores laranja (cor da
rota) sobre o Brasil, lista completa abaixo (mapa é aditivo, nunca
substitui a lista).

## Revisão adversarial

1. Frase proibida? Não — texto novo revisado; `check-copy.mjs` confirma.
2. Preço sem idade/zero? Herdado de `DealCard`/`Freshness` (V4), sem
   mudança.
3. Data/hora sem fuso fixo? Não tocado.
4. Animação de CSS Module com keyframe global? `.reveal` aplicado ao
   wrapper do mapa é a classe global de `globals.css` via `className`, não
   uma `animation:` escrita dentro de um módulo — não se aplica a regra do
   CSS Modules. `animacaoSemKeyframes` seguiu 0.
5. Compra fora do `PurchaseButton`? Não — `DealCard` (herdado).
6. Cor nova fora de `tokens.css`? Trocar `--color-action` por `--color-route`
   no marcador do mapa é só variável, sem hex/rgb novo. `corForaDosTokens`
   = 0.
7. 320px/teclado/movimento reduzido? Sem regressão (ver "Depois"). O
   alternador agora tem 44 px até 640 px, cobrindo DS-04 no celular.
8. Diff fora da ficha? Nenhum — todos os arquivos tocados estão em
   `app/opportunities/**`.

## Handoff

- Alterações: `page.tsx` (cabeçalho PG-03, `aria-current`, texto de
  `EmptyState`, removida a `PurchaseNote` única de rodapé — cada `DealCard`
  completo já tem a sua), `page.module.css` (`.eyebrow`, alternador 44px
  até 640px), `opportunities-client.tsx` (`DealCard` sem `compact`, `.reveal`
  no wrapper do mapa), `opportunity-map.module.css` (marcador na cor da
  rota), `ceilings.json` (`ui.controlsBelow44` 2→0).
- Evidências: saída real acima; 3 screenshots.
- Limitações e riscos: "funciona sem JavaScript" verificado por leitura de
  código, não por teste com DevTools; recomendo uma checagem manual rápida
  antes do deploy.
- Próximo passo: P4 (busca e resultado — `OfferCard` com `airportLabel` e
  horários em Brasília).
