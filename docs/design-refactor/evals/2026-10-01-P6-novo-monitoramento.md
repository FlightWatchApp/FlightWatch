# Eval P6 — 2026-10-01

Branch: `main` · Quem rodou: Claude Code (agente)

## Plano

- Objetivo: PG-07 — "Preço desejado" em rótulo e mensagens (as 3 últimas
  ocorrências de "preço-alvo" do site), origem/destino com `airportLabel`,
  botão `lg` com `loading`.
- Não objetivo: mudar validação ou `POST /v1/watches` (mantido tal qual).
- Arquivos permitidos: `apps/web/src/app/watches/new/**`,
  `scripts/design/ceilings.json`.

## Red

```text
$ node -e "import('./scripts/design/check-copy.mjs').then(m=>console.log(JSON.stringify(m.run(),null,2)))"
{
  "metrics": { "frasesProibidas": 3 },
  "details": [
    "apps/web/src/app/watches/new/actions.ts:17 \"preço-alvo\" → use \"preço desejado\"",
    "apps/web/src/app/watches/new/new-watch-form.tsx:53 \"preço-alvo\" → use \"preço desejado\"",
    "apps/web/src/app/watches/new/new-watch-form.tsx:194 \"Preço-alvo\" → use \"preço desejado\""
  ]
}
```

Exatamente os 2 arquivos e as 3 linhas que a própria ficha apontava.

## Mudanças

- `actions.ts`: mensagem de erro `INVALID_WATCH_INPUT` → "...confira rota,
  datas e preço desejado."
- `new-watch-form.tsx`: mensagem de validação local → "Informe um preço
  desejado válido, maior que zero."; rótulo do campo → "Preço desejado";
  `Select` de origem/destino passam a mostrar `airportLabel(code)` (mesma
  função de domínio já usada em `search-form.tsx`, SPEC-014) em vez do
  código IATA cru; botão de submit trocado de
  `<Button disabled={isPending}>{isPending ? 'Criando…' : '...'}</Button>`
  para `<Button size="lg" loading={isPending}>Criar monitoramento</Button>`
  — mesmo padrão de `search-form.tsx` (`size="lg" loading={isPending}`).
- `page.module.css`: `.back` ganhou `display: inline-flex; align-items:
center; min-height: var(--space-6)` — o mesmo defeito de alvo de toque
  (22px) já corrigido em `watches/[id]` na P5, encontrado aqui pelo mesmo
  padrão de link "← Voltar".

## Depois

```text
$ node -e "...check-copy.mjs...run()..."
{ "metrics": { "frasesProibidas": 0 }, "details": [] }

$ pnpm --filter @flight-watch/web typecheck   # verde
$ pnpm --filter @flight-watch/web lint        # verde
$ npx turbo run test --concurrency=1          # 20/20 tasks
$ pnpm build                                  # verde
$ pnpm format:check                           # verde exceto next-env.d.ts (P-07)
$ pnpm check:design                           # TODAS as métricas na meta 0 — primeira vez na sessão
```

`eval-ui.mjs` (sessão/watch/busca reais, 9 rotas × 3 larguras — primeira
rodada desta sessão com `FW_SEARCH_ID` definido, então inclui `resultado`
pela primeira vez desde P4):

```text
Totais: {"consoleErrors":0,"overflow":0,"smallText":0,"targetsBelow24":1,
         "controlsBelow44":0,"brokenAnimations":0,"runningWithReducedMotion":0}
```

`ctrl<44` chega a zero em todo o site. `alvo<24` cai de 2 para 1: a
correção do "← Voltar" desta página eliminou uma das duas ocorrências
restantes; a que sobra é o "← Voltar" de `search/[id]`, documentado como
fora do escopo de `OfferCard`/`SearchForm` desde P4 — não corrigido aqui
por estar fora da lista de arquivos permitidos desta ficha (só
`watches/new/**`).

## Incidente de ambiente (não é regressão de código)

Ao reiniciar `next start` para este gate, o `kill` do PID salvo
(`pnpm exec next start`) matou só o processo wrapper do pnpm, não o
`next-server` filho — o novo `next start` falhou com `EADDRINUSE` e a
porta 3100 continuou servindo o build antigo. O primeiro `eval-ui.mjs`
rodou contra esse processo "fantasma" e voltou com `console=6` por rota e
`controlsBelow44` somando 63 — números piores que qualquer medição real
desta sessão, sinal de que algo estava errado no processo, não no código.
Identificado via `ss -ltnp` (PID real do `next-server`, não o do `pnpm
exec`), matado corretamente, build servido do zero, eval re-executado e
limpo. Registrado aqui porque o número alto apareceu de verdade no
terminal e merece explicação, não só descarte silencioso.

## Gates

| Gate | Resultado                                                       | Observação                                                           |
| ---- | --------------------------------------------------------------- | -------------------------------------------------------------------- |
| G1   | verde                                                           | exceto `next-env.d.ts` (pré-existente, P-07)                         |
| G2   | verde                                                           | `eslint src`                                                         |
| G3   | verde                                                           | `tsc`                                                                |
| G4   | verde                                                           | 20/20 tasks (sem teste novo — tarefa é só cópia/UI, sem lógica nova) |
| G5   | verde                                                           | `pnpm build`                                                         |
| G6   | verde                                                           | `pnpm check:design` — todas as métricas na meta 0                    |
| G7   | `ctrl<44` zera em todo o site; `alvo<24` cai a 1 (ver "Depois") |
| G8   | feito                                                           | `docs/design-refactor/evals/p6-after/novo-{390,1440}.png`            |

## Métricas

| Métrica             | Antes (P5) | Depois (P6) | Teto novo |
| ------------------- | ---------: | ----------: | --------: |
| `frasesProibidas`   |          3 |           0 |         0 |
| `alvo<24` (eval-ui) |          2 |           1 |      meta |

`alvo<24` não chegou a 0 nesta tarefa (falta o "← Voltar" de
`search/[id]`, fora do escopo) — `frasesProibidas` é a métrica que chega à
meta aqui.

`frasesProibidas` chega à meta final de 0 em todo o repositório — não
resta nenhuma ocorrência das 7 frases proibidas de `check-copy.mjs` em
`apps/web/src` nem em `packages/notifications/src`.

## Screenshots

`p6-after/novo-{390,1440}.png`: "Preço desejado" no rótulo e na dica,
`Select`s mostrando "DOU · Dourados"/"GRU · São Paulo/Guaru..." em vez do
código cru, botão "Criar monitoramento" em tamanho `lg`, "← Voltar" com
alvo de toque correto.

## Revisão adversarial

1. Frase proibida? `frasesProibidas` = 0 confirmado por `check-copy.mjs`.
2. Preço sem idade/zero? N/A — formulário de criação, sem preço observado
   ainda.
3. Data/hora sem fuso fixo? N/A — nenhuma formatação de instante nesta
   tela (só `<input type="date">` nativo).
4. Animação de CSS Module com keyframe global? Nenhuma animação nova
   introduzida.
5. Compra fora do `PurchaseButton`? N/A — esta tela não tem CTA de compra.
6. Cor nova fora de `tokens.css`? Nenhuma cor nova.
7. 320px/teclado/movimento reduzido? `overflow`=0 nas 3 larguras; nenhum
   elemento novo que dependa de animação.
8. Diff fora da ficha? Nenhum — as 3 linhas de cópia, a troca para
   `airportLabel` (reuso, não arquivo novo), o botão `lg`/`loading` e o
   `.back` do próprio `page.module.css` estão todos dentro de
   `apps/web/src/app/watches/new/**`.

## Handoff

- Alterações: `watches/new/actions.ts` (mensagem de erro), `watches/new/
new-watch-form.tsx` (rótulo, mensagem de validação, `airportLabel`,
  botão `lg`/`loading`), `watches/new/page.module.css` (`.back` com alvo
  de toque correto), `scripts/design/ceilings.json` (`frasesProibidas`
  0→0, meta atingida).
- Evidências: saída real acima; 2 screenshots; achado de ambiente
  documentado e corrigido na própria tarefa.
- Limitações e riscos: nenhum novo.
- Próximo passo: P7 (conta — `/login`, `/register`, `/verify-email`).
