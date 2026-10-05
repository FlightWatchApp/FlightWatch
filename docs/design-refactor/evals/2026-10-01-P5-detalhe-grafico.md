# Eval P5 — 2026-10-01

Branch: `main` · Quem rodou: Claude Code (agente)

## Plano

- Objetivo: detalhe de PG-06 (`RouteLine` `lg` com cidades e `animated`,
  destaques, `dl` "Menor preço observado"/"Preço desejado", `Freshness`,
  `PurchaseButton` `lg fullWidth`) e `PriceHistoryChart` de CP-10 (ordenação
  cronológica, halo nos rótulos, área em degradê, pontos diferenciados,
  `<title>` por ponto, tabela acessível, linha desenha).
- Arquivos permitidos: `app/watches/[id]/**`,
  `components/watches/price-history-chart.*`, `lib/domain/` (funções do
  gráfico).
- Red escolhido: teste de `sortChronologically` (não existia) + os dois
  rótulos do eixo em `11px` (abaixo de 12px).

## Red

```text
$ pnpm --filter @flight-watch/web test -- price-history
Error: sortChronologically is not exported

$ grep -n "font-size: 11px" apps/web/src/components/watches/price-history-chart.module.css
.targetLabel { font-size: 11px; }
.axisLabel { font-size: 11px; }
```

## Achado durante a implementação: erro de hidratação por `<title>` com vários filhos

CP-10 já documenta esse defeito explicitamente ("Cada ponto tem `<title>`
com **uma única string**... vários filhos em `<title>` quebram a
hidratação") — e eu cometi exatamente esse erro na primeira versão:

```tsx
<title>
  {formatAbsoluteDateTime(point.observedAt)}:{' '}
  {formatMoney(...)}
</title>
```

Três filhos (duas expressões + um nó de texto `": "`), não uma string só.
`eval-ui.mjs` confirmou na hora: `console` subiu de 0 para 1 em
`/watches/:id` (erro #418, minificado) nas 3 larguras. Corrigido para um
único template literal:

```tsx
<title>{`${formatAbsoluteDateTime(...)}: ${formatMoney(...)}`}</title>
```

Rebuild + reteste: `console` voltou a 0. Registrado aqui porque é
exatamente o tipo de erro que a spec avisou e eu mesmo cometi primeiro —
evidência de que o aviso da ficha era necessário, não redundante.

## Depois

```text
$ pnpm --filter @flight-watch/web test        # 35 testes (+4 price-history, +1 formatMoneyRounded)
$ pnpm --filter @flight-watch/web typecheck   # verde (após ampliar PurchaseButton.size para aceitar "lg")
$ pnpm --filter @flight-watch/web lint        # verde (após trocar duas non-null assertions por guardas)
$ npx turbo run test --concurrency=1          # 20/20 tasks
$ pnpm build                                  # verde
$ pnpm format:check                           # verde exceto next-env.d.ts (P-07)
$ pnpm check:design                           # sem mudança (os 3 restantes são de watches/new, P6)
```

`eval-ui.mjs`:

```text
Antes (P4):     console=0  overflow=0  texto<12=6  alvo<24=3  ctrl<44=0
Durante (bug):  console=3  overflow=0  texto<12=0  alvo<24=3  ctrl<44=0
Depois (P5):    console=0  overflow=0  texto<12=0  alvo<24=2  ctrl<44=0
```

`texto<12` chega a **zero em todo o site** (os dois rótulos do gráfico
eram os últimos 6 — 2 rótulos × 3 larguras). `alvo<24` caiu de 3 para 2: o
"← Voltar" desta página também estava nesse caso (22px) e foi corrigido
junto, por estar no mesmo arquivo já em escopo.

## Gates

| Gate | Resultado                                                                        | Observação                                                   |
| ---- | -------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| G1   | verde                                                                            | exceto `next-env.d.ts` (pré-existente, P-07)                 |
| G2   | verde                                                                            | `eslint src`                                                 |
| G3   | verde                                                                            | `tsc`                                                        |
| G4   | verde                                                                            | 20/20 tasks + 5 testes novos                                 |
| G5   | verde                                                                            | `pnpm build`                                                 |
| G6   | verde                                                                            | `pnpm check:design` sem mudança                              |
| G7   | `texto<12` chega a 0 em todo o site; `console` voltou a 0 depois do achado acima | ver seção dedicada                                           |
| G8   | feito                                                                            | `docs/design-refactor/evals/p5-after/detalhe-{390,1440}.png` |

## Métricas

| Métrica              | Antes (P4) | Depois (P5) |                Teto novo |
| -------------------- | ---------: | ----------: | -----------------------: |
| `texto<12` (eval-ui) |          6 |           0 | sem teto (meta já era 0) |
| `alvo<24` (eval-ui)  |          3 |           2 | sem teto (meta já era 0) |

## Screenshots

`p5-after/detalhe-{390,1440}.png`: `RouteLine` `lg` com cidades como `h1`,
selo "MONITORANDO", destaque "Menor preço já observado", `dl` "Menor preço
observado", `Freshness` em âmbar ("preço expirado, confirme no parceiro" —
dado real do ambiente de teste), botão "Atualizar preço" (secundário,
`fullWidth`), painel do gráfico com "O eixo não começa em zero", pontos
coloridos, rótulos de eixo em "R$ 964" (sem centavos) e "Ver histórico em
tabela (4)" recolhido.

## Revisão adversarial

1. Frase proibida? Não — "Meta" virou "Preço desejado" no `dl`.
2. Preço sem idade/zero? `Freshness` substitui o texto estático de "Última
   consulta"; a linha "Última verificação" só aparece quando não repetiria
   o `Freshness` (sem oferta, inativo ou dado velho), conforme PG-06.
3. Data/hora sem fuso fixo num client component? `PriceHistoryChart` é
   Server Component (sem `'use client'`) — `formatAbsoluteDateTime` roda só
   no servidor, sem risco de divergência; `Freshness` (client) já é seguro
   desde V4.
4. Animação de CSS Module com keyframe global? `.line` usa
   `var(--keyframes-draw)`, `.dotLast` usa `var(--keyframes-pop)`.
   `animacaoSemKeyframes` = 0.
5. Compra fora do `PurchaseButton`? Não — mantido, agora com `size="lg"`
   (exigiu ampliar o tipo do componente, ver "Diff fora da ficha").
6. Cor nova fora de `tokens.css`? `stopColor="var(--color-action)"` no
   gradiente da área; `corForaDosTokens` = 0.
7. 320px/teclado/movimento reduzido? `overflow` seguiu 0. Movimento
   reduzido: `@media (prefers-reduced-motion: reduce)` zera o
   `stroke-dashoffset` da linha e fixa `.dotLast` em `opacity: 1` — a linha
   e o último ponto aparecem completos, não escondidos esperando uma
   animação que não roda.
8. Diff fora da ficha? Dois arquivos justificados: (a)
   `components/purchase/purchase-button.tsx` — `size` ampliado para aceitar
   `"lg"` (só o tipo da prop, exigido pelo próprio CP-06/PG-06 "PurchaseButton
   lg fullWidth"); (b) `lib/domain/money.ts`+teste — `formatMoneyRounded`,
   exigido por CP-10 ("sem centavos" no eixo), mesmo padrão de função de
   domínio compartilhada e testada já usado em V4/P4.

## Handoff

- Alterações: `watches/[id]/page.tsx` (reescrito: `RouteLine`, destaques,
  `dl`, `Freshness`, `PurchaseButton lg fullWidth`, condição de
  "Última verificação"), `watches/[id]/page.module.css` (reescrito,
  `column-reverse` < 640px, `.back` com `min-height`),
  `watches/price-history-chart.tsx` (reescrito: ordenação, área, pontos
  diferenciados, `<title>` por ponto, tabela acessível, animação),
  `watches/price-history-chart.module.css` (reescrito: 12px, halo),
  `lib/domain/price-history.ts`+teste (novo: `sortChronologically`,
  `indexOfLowest`), `lib/domain/money.ts`+teste (`formatMoneyRounded`),
  `components/purchase/purchase-button.tsx` (`size` aceita `"lg"`).
- Evidências: saída real acima; 2 screenshots.
- Limitações e riscos: nenhum novo — o achado do `<title>` foi encontrado e
  corrigido dentro da própria tarefa, com evidência real do antes/depois.
- Próximo passo: P6 (novo monitoramento).
