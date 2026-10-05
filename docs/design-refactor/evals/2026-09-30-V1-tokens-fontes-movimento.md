# Eval V1 — 2026-09-30

Branch: `main` · Nível 1 — antes/depois de 2 telas revisado nesta tarefa
(screenshots abaixo; ver também `docs/design-refactor/evals/v1-after/`) ·
Quem rodou: Claude Code (agente)

## Plano

- Objetivo: `tokens.css`/`globals.css` novos (paleta petróleo/papel,
  semânticos, tipografia, espaço, raio, sombra, durações,
  `--keyframes-*`), fontes novas (Instrument Sans + JetBrains Mono) no
  `layout.tsx`, `.reveal`/`.iata`/`.tabular-nums` e movimento reduzido —
  sem redesenhar componentes além do necessário para não quebrar.
- Arquivos permitidos: `styles/tokens.css`, `styles/globals.css`,
  `app/layout.tsx` (fontes), `components/ui/modal.module.css` (overlay por
  token), módulos que usavam primitivo removido, `ceilings.json`.
- Risco avaliado antes de começar: a troca de paleta muda toda tela — por
  isso screenshots de todas as rotas em vez de só as tocadas diretamente.
- Red escolhido: `contrasteAbaixo` e `corForaDosTokens` acima do teto que a
  tarefa deveria baixar.

## Red

```text
$ pnpm check:design   # antes da tarefa
corForaDosTokens             1  (teto 1)
contrasteAbaixo              6  (teto 6)
```

## Cor: primitivos e cálculo de contraste

Paleta de `docs/BRAND.md`/`01-spec-design-system.md` §DS-01 aplicada
literalmente (petróleo `#0F4C5C`/`#0A3844`, papel `#F5F3EE`, tinta
`#14212B`, laranja rota `#C4622D`/`#9C4516`/`#E8834F`, verde `#1D6B45`,
âmbar `#7F5200`, vermelho `#A8261D`). Os tons intermediários que a spec não
lista em hex (texto secundário, muted, borda forte, fundos "soft" dos 5
selos, texto sobre petróleo profundo) foram calculados para bater com os
mínimos de DS-02, verificados um a um antes de escrever o arquivo:

```text
tinta/papel               14.77 (spec: 14.8)
petróleo-700/papel         8.57
branco/petróleo-700        9.51 (spec: 9.5)
branco/petróleo-900       12.64
rota-700/papel              5.78 (spec: 5.8)
rota-500/papel               3.69 (spec: 3.7, só gráfico)
secundário/papel             9.01
muted/papel                  5.37 (spec: 5.4)
muted/branco                 5.96
muted/surface-sunken         5.31
borda-forte/branco           3.79 (spec: 3.8)
texto-on-dark-muted/petróleo-900   6.51
action-soft-text/action-soft-bg   10.68
success-700/success-soft-bg        5.59
warning-700/warning-soft-bg        5.84
danger-700/danger-soft-bg          5.99
route-text/route-soft              5.53
branco/success-700 (texto em selo sólido)   6.48
branco/danger-700                          7.09
```

Todos ≥ o mínimo exigido (4,5 texto normal, 3 gráfico/borda/foco).

## Depois

```text
$ pnpm check:design
OK   animacaoSemKeyframes        0  (teto 0, meta 0)
OK   semMovimentoReduzido        0  (teto 0, meta 0)
OK   corForaDosTokens            0  (teto 0, meta 0)
OK   contrasteAbaixo             0  (teto 0, meta 0)
OK   compraSemSponsored          0  (teto 0, meta 0)
OK   paginaSemAvisoComissao      0  (teto 0, meta 0)
OK   semPaginaTransparencia      0  (teto 0, meta 0)
Todas as métricas dentro do teto.

$ pnpm --filter @flight-watch/web typecheck   # verde
$ pnpm --filter @flight-watch/web lint        # verde
$ npx turbo run test --concurrency=1          # 20/20 tasks verdes
$ pnpm build                                  # verde, todas as rotas geradas
$ pnpm format:check                           # verde exceto next-env.d.ts (P-07)
```

`eval-ui.mjs` (mesmo sistema local, Playwright fora do repo):

```text
Antes (A3):  console=0  overflow=13  texto<12=6  alvo<24=23  ctrl<44=24
Depois (V1): console=0  overflow=13  texto<12=6  alvo<24=23  ctrl<44=24
```

Zero regressão em qualquer métrica — a pressão em pixels da rolagem
horizontal mudou (ex.: 320px foi de 31px para 34px de estouro, `--container-max`
subiu de 72rem para 76rem e Instrument Sans tem métricas um pouco mais
largas que Public Sans), mas a **contagem de rotas afetadas** (a métrica que
o teto mede) ficou idêntica — os mesmos layouts que já vazavam em 320px
continuam vazando, nenhum novo. Corrigir isso é da fase seguinte (grid
`1fr` → `minmax(0,1fr)`), fora do escopo de V1.

## Gates

| Gate | Resultado               | Observação                                                                                       |
| ---- | ----------------------- | ------------------------------------------------------------------------------------------------ |
| G1   | verde                   | exceto `next-env.d.ts` (pré-existente, P-07)                                                     |
| G2   | verde                   | `eslint src`                                                                                     |
| G3   | verde                   | `tsc`                                                                                            |
| G4   | verde                   | 20/20 tasks (`--concurrency=1`)                                                                  |
| G5   | verde                   | `pnpm build`, todas as rotas                                                                     |
| G6   | verde                   | `pnpm check:design`, `corForaDosTokens` e `contrasteAbaixo` chegaram à meta (0)                  |
| G7   | vermelho, sem regressão | mesmas 4 classes de defeito pré-existentes de A3, nenhuma piorou/melhorou (fora do escopo de V1) |
| G8   | feito                   | 20 screenshots (10 rotas × 390/1440) em `docs/design-refactor/evals/v1-after/`                   |

## Métricas

| Métrica              | Antes (A3) | Depois (V1) | Teto novo |
| -------------------- | ---------: | ----------: | --------: |
| `corForaDosTokens`   |          1 |           0 |         0 |
| `contrasteAbaixo`    |          6 |           0 |         0 |
| `console` (eval-ui)  |          0 |           0 |  sem teto |
| `overflow` (eval-ui) |         13 |          13 |  sem teto |
| `ctrl<44` (eval-ui)  |         24 |          24 |        24 |

## Screenshots

Antes: `docs/design-refactor/evals/baseline/` e `a3-after/`. Depois: as 10
rotas × 390/1440 em `docs/design-refactor/evals/v1-after/` (mesmos nomes de
arquivo, sobrescritos com a paleta nova). Revisadas nesta tarefa:
`promocoes-1440.png` (cabeçalho petróleo, botão "Comprar passagem" sólido,
código IATA em JetBrains Mono, selo "Menor preço já visto" em verde sobre
fundo claro) e `detalhe-1440.png` (tag "MONITORANDO", botão "Encerrar" em
vermelho, gráfico de histórico) — nenhum texto ilegível, nenhuma cor fora do
lugar.

## Revisão adversarial

1. Frase proibida? Não tocado (sem mudança de texto nesta tarefa).
2. Preço sem idade/zero? Não tocado.
3. Data/hora sem fuso fixo? Não tocado.
4. Animação de CSS Module com keyframe global? A infraestrutura
   (`--keyframes-*` + `@keyframes fw-*` em `globals.css`) foi criada mas
   **nenhum componente a usa ainda** (V1 é só fundação; consumo é V3/V4/V5)
   — `animacaoSemKeyframes`/`anim-quebrada` deram 0 trivialmente. Vale
   conferir de novo quando a primeira animação real for ligada.
5. Compra fora do `PurchaseButton`? Não tocado (A3 já resolveu).
6. Cor nova fora de `tokens.css` ou par de contraste novo fora de `PAIRS`?
   Zero cor solta fora de `tokens.css` (verificado por `check-tokens.mjs`,
   que varre `.css`/`.tsx` do zero a cada run — não é uma alegação, é
   medido). Nenhum par novo precisou entrar em `PAIRS` porque os tokens
   `--color-route`/`--color-route-text`/`--color-text-on-dark-muted` **já
   estavam** na lista (a linha de base media "token ausente" porque eles
   não existiam ainda) — resolvido por completar a definição, não por
   adicionar uma checagem nova.
7. 320px/teclado/movimento reduzido? Ver "Depois" acima — sem regressão.
   Movimento reduzido: bloco `@media (prefers-reduced-motion: reduce)`
   mantido e reforçado (`animation-delay: 0ms !important` adicionado, para
   `--reveal-delay` não atrasar um elemento que já roda em 0,001 ms).
8. Diff fora da ficha? Migrei 5 arquivos de componente
   (`icon-button.module.css`, `button.module.css`, `skeleton.module.css`,
   `inline-alert.module.css`) que usavam primitivo removido diretamente
   (`--fw-red-600`, `--fw-ink-200`, `--fw-sky-100`, `--fw-moss-100`,
   `--fw-amber-100`, `--fw-red-100`) — **previsto explicitamente** na lista
   de arquivos permitidos da ficha ("módulos que usavam primitivo
   removido"), não é fora de escopo. Cada substituição é 1:1 semântica:
   o valor antigo do primitivo já era idêntico ao token semântico
   equivalente (ex.: `--fw-sky-100` resolvia para o mesmo valor de
   `--color-action-soft-bg`), então não houve mudança visual nesses 5
   arquivos além da paleta em si.

## Handoff

- Alterações: `styles/tokens.css` (reescrito), `styles/globals.css`
  (`::selection`, 6 `@keyframes`, `.reveal`, `.iata`, reduced-motion
  reforçado), `app/layout.tsx` (Instrument Sans + JetBrains Mono no lugar
  de Fraunces/Public Sans/IBM Plex Mono, `themeColor` atualizado),
  `components/ui/modal.module.css` (`--shadow-lg`, `--color-overlay`),
  `icon-button.module.css`, `button.module.css`, `skeleton.module.css`,
  `inline-alert.module.css` (migração de primitivo removido),
  `scripts/design/ceilings.json` (2 tetos zerados).
- Evidências: saída real acima; 20 screenshots antes/depois.
- Limitações e riscos: nenhum novo; overflow/alvo<24/texto<12 seguem
  pré-existentes e catalogados para a fase seguinte (V3 em diante).
- Próximo passo: V2 (arquivos de marca — símbolo, logo, metadados).
