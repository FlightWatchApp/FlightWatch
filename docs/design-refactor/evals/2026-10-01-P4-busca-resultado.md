# Eval P4 — 2026-10-01

Branch: `main` · Quem rodou: Claude Code (agente)

## Plano

- Objetivo: busca de PG-04 (faixa petróleo, `airportLabel` nas opções,
  inverter origem/destino, botão `lg` com `loading`) e resultado de PG-05
  com `OfferCard` de CP-16 (horário em Brasília, `Freshness`, "Mais barata
  desta busca", "Preço desejado").
- Arquivos permitidos: `app/search/**`, `ceilings.json`.
- Red escolhido: teste de `formatFlightTime` (não existia) + `frasesProibidas`
  apontando "preço-alvo"/"Preço-alvo" em `offer-card.tsx`.

## Red

```text
$ pnpm --filter @flight-watch/web test -- freshness
Error: formatFlightTime is not exported

$ pnpm check:design   # antes
frasesProibidas  5  (3 de watches/new, 2 de offer-card.tsx)
```

## Depois

```text
$ pnpm --filter @flight-watch/web test        # 30 testes (+1 formatFlightTime)
$ pnpm --filter @flight-watch/web typecheck   # verde
$ pnpm --filter @flight-watch/web lint        # verde
$ npx turbo run test --concurrency=1          # 20/20 tasks
$ pnpm build                                  # verde
$ pnpm format:check                           # verde exceto next-env.d.ts (P-07)
$ pnpm check:design                           # frasesProibidas 5→3
```

`formatFlightTime('2026-09-30T11:00:00Z')` → `'08:00'` (Brasília, UTC-3),
testado independente do fuso do processo — critério de aceite da ficha.

`eval-ui.mjs`:

```text
Antes (P3):  console=0  overflow=0  texto<12=6  alvo<24=3  ctrl<44=0
Depois (P4): console=0  overflow=0  texto<12=6  alvo<24=3  ctrl<44=0
```

Zero regressão. `resultado@390` continua com o mesmo "← Nova busca" (22px,
já catalogado, fora do escopo de `OfferCard`/`SearchForm`).

## Gates

| Gate | Resultado     | Observação                                                                      |
| ---- | ------------- | ------------------------------------------------------------------------------- |
| G1   | verde         | exceto `next-env.d.ts` (pré-existente, P-07)                                    |
| G2   | verde         | `eslint src`                                                                    |
| G3   | verde         | `tsc`                                                                           |
| G4   | verde         | 20/20 tasks + 1 teste novo (`formatFlightTime`)                                 |
| G5   | verde         | `pnpm build`                                                                    |
| G6   | verde         | `pnpm check:design`, `frasesProibidas` 5→3                                      |
| G7   | sem regressão | mesmas métricas de P3                                                           |
| G8   | feito         | `docs/design-refactor/evals/p4-after/{busca-390,busca-1440,resultado-1440}.png` |

## Métricas

| Métrica           | Antes (P3) | Depois (P4) | Teto novo |
| ----------------- | ---------: | ----------: | --------: |
| `frasesProibidas` |          5 |           3 |         3 |

## Screenshots

`p4-after/busca-1440.png`: faixa petróleo com brilho, "Para onde você quer
ir?", cartão sobreposto com `--shadow-lg`, campos "DOU · Dourados"/
"GRU · São Paulo/Guarulhos", botão de inverter entre eles, `PurchaseNote`
abaixo. `p4-after/resultado-1440.png`: `RouteLine` `lg` com cidades como
`h1`, "1 oferta", selo "Mais barata desta busca", horário "05:00 → 07:30
(horários de Brasília)", `Freshness` em âmbar com "preço expirado, confirme
no parceiro" (dado real do ambiente de teste — a busca é de uma sessão
anterior), botão "Atualizar preço" no lugar de "Comprar passagem".

## Revisão adversarial

1. Frase proibida? Reduzida (ver "check:design"); nenhuma nova.
2. Preço sem idade/zero? `OfferCard` agora usa `Freshness` (antes era texto
   estático "preço observado; pode mudar..."); nenhum `R$ 0,00`.
3. Data/hora sem fuso fixo num client component? `OfferCard` é
   `'use client'` e formata `departureAt`/`arrivalAt` — exatamente o motivo
   de extrair `formatFlightTime` com `DISPLAY_TIME_ZONE` e testá-la antes de
   usar, em vez de repetir o padrão arriscado.
4. Animação de CSS Module com keyframe global? Nenhuma animação nova nesta
   tarefa (reaproveita `RouteLine`/`Freshness`/`Button`, já cobertos).
5. Compra fora do `PurchaseButton`? Não — mantido.
6. Cor nova fora de `tokens.css`? `.band` usa `radial-gradient(... var(--color-route-glow)
..., var(--color-brand-strong))` — só variáveis. `.eyebrow` usa
   `--fw-route-300` sobre fundo escuro, a mesma exceção documentada em DS-01.
   `corForaDosTokens` = 0.
7. 320px/teclado/movimento reduzido? Sem regressão.
8. Diff fora da ficha? Nenhum — todos os arquivos tocados estão em
   `app/search/**`, exceto `lib/domain/freshness.ts`+teste e
   `components/ui/icon.tsx` (+`IconSwap`), justificados pelo mesmo padrão já
   usado em tarefas anteriores (função de domínio compartilhada evita
   duplicar lógica de fuso horário; ícone novo exigido por CP-16/DS-06).

## Handoff

- Alterações: `search/page.tsx` (faixa petróleo, cartão sobreposto),
  `search/page.module.css` (reescrito), `search/search-form.tsx`
  (`airportLabel` real, inverter origem/destino, botão `lg`+`loading`),
  `search/[id]/offer-card.tsx` (reescrito: `RouteLine`, horário Brasília,
  `Freshness`, "Mais barata desta busca", "Preço desejado"),
  `search/[id]/page.tsx` (`h1` com `RouteLine` `lg`, contagem de ofertas,
  `cheapest`), `search/[id]/page.module.css` (classes novas, limpeza de
  órfãs), `lib/domain/freshness.ts`+teste (`formatFlightTime`),
  `components/ui/icon.tsx` (+`IconSwap`), `ceilings.json`
  (`frasesProibidas` 5→3).
- Evidências: saída real acima; 3 screenshots.
- Limitações e riscos: nenhum novo.
- Próximo passo: P5 (detalhe do monitoramento e gráfico de histórico).
