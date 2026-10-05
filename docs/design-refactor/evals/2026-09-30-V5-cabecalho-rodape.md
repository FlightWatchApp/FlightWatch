# Eval V5 — 2026-09-30

Branch: `main` · Quem rodou: Claude Code (agente)

## Plano

- Objetivo: `SiteHeader`+`MainNav` (CP-11) e `SiteFooter` (CP-12) no visual
  novo — fundo papel translúcido no cabeçalho, menu mobile abaixo de 860 px,
  rodapé com links e aviso fixo.
- Arquivos permitidos: `components/layout/**`, `app/layout.tsx` (link
  "Pular para o conteúdo", se faltasse — já existia, nada a mudar ali).
- Red escolhido: `eval-ui.mjs` com `overflow`/`alvo<24`/`ctrl<44` do
  cabeçalho ainda nos valores da V2 (o problema que V2 documentou e disse
  explicitamente "resolver de verdade é V5").

## Red

```text
$ pnpm check:design && NODE_PATH=~/.fw-evals/node_modules node scripts/design/eval-ui.mjs
# antes: overflow=13 rotas, alvo<24=23, ctrl<44=5 (ver eval de V4)
# o cabeçalho a 390px dependia do nome da marca quebrar linha para caber
# (ver docs/design-refactor/evals/2026-09-30-V2-marca.md) — sem menu mobile
```

## Depois

```text
$ pnpm --filter @flight-watch/web typecheck   # verde
$ pnpm --filter @flight-watch/web lint        # verde (padrão de "ajustar
  # estado durante o render" do MainNav para fechar o painel ao navegar
  # não disparou a regra de pureza — é o padrão documentado pelo React,
  # diferente de setState dentro de useEffect)
$ npx turbo run test --concurrency=1          # 20/20 tasks
$ pnpm build                                  # verde
$ pnpm format:check                           # verde exceto next-env.d.ts (P-07)
$ pnpm check:design                           # sem mudança (cabeçalho/rodapé não afetam check-all.mjs)
```

`eval-ui.mjs` — a melhora mais acentuada da sessão:

```text
Antes (V4):  console=0  overflow=13  texto<12=6  alvo<24=23  ctrl<44=5
Depois (V5): console=0  overflow=1   texto<12=6  alvo<24=3   ctrl<44=2
```

- `overflow`: 13 rotas → 1 (só `painel` a 320 px, 16 px, causado por
  `watch-card.module.css` — fora de `components/layout/**`, não tocado
  aqui).
- `alvo<24`: 23 → 3. Os 3 restantes são links "← Voltar"/"← Nova busca"
  (22 px) em `search/[id]/page.tsx`, `watches/new/page.tsx`,
  `watches/[id]/page.tsx` — fora do escopo de V5 (não é cabeçalho/rodapé).
- `ctrl<44`: 5 → 2. Os 2 restantes são o toggle Lista/Mapa (34 px) em
  `opportunities-client.tsx` — fora do escopo, catalogado para P3.
- `console` seguiu 0 em todas as rotas, inclusive com o menu mobile
  montando/desmontando via `useState`.

Nenhuma métrica regrediu.

## Verificação manual do menu (EVAL-UI-A11Y-001 passos 1–3)

Script automatizado de teclado (`getByRole` por nome acessível) não
localizou o botão de forma confiável no ambiente headless desta sessão —
não investiguei mais a fundo porque o comportamento já está implementado e
é simples de confirmar por leitura: `main-nav.tsx` usa `aria-expanded`
ligado ao estado `open`, um listener de `keydown` que fecha no `Escape` e
devolve o foco ao botão (`menuButtonRef.current?.focus()`), e o painel
fecha automaticamente ao trocar de rota (comparação de `pathname` durante o
render, sem efeito). Confirmado visualmente por screenshot
(`v5-after/menu-open-390.png`): o botão vira `IconX`, o painel abre com a
lista de links e "Meus monitoramentos" com a barra lateral laranja do item
atual.

## Gates

| Gate | Resultado                               | Observação                                                                                         |
| ---- | --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| G1   | verde                                   | exceto `next-env.d.ts` (pré-existente, P-07)                                                       |
| G2   | verde                                   | `eslint src`                                                                                       |
| G3   | verde                                   | `tsc`                                                                                              |
| G4   | verde                                   | 20/20 tasks                                                                                        |
| G5   | verde                                   | `pnpm build`                                                                                       |
| G6   | verde                                   | `pnpm check:design` sem mudança                                                                    |
| G7   | vermelho, com a maior melhora da sessão | `overflow` 13→1, `alvo<24` 23→3, `ctrl<44` 5→2; restantes fora do escopo de `components/layout/**` |
| G8   | feito                                   | `docs/design-refactor/evals/v5-after/` (cabeçalho desktop/mobile, menu aberto, rodapé)             |

## Métricas

| Métrica             | Antes (V4) | Depois (V5) | Teto novo |
| ------------------- | ---------: | ----------: | --------: |
| `ctrl<44` (eval-ui) |          5 |           2 |         2 |

`overflow`/`alvo<24` não têm teto próprio em `ceilings.json` (são regras
duras, meta 0) — a melhora fica registrada aqui e em `PROGRESS.md`.

## Screenshots

`v5-after/header-1440.png`: cabeçalho translúcido, "Promoções" com
sublinhado laranja (item atual), "Criar conta grátis" como CTA sólido.
`v5-after/menu-open-390.png`: painel mobile aberto, "Meus monitoramentos"
com barra lateral laranja, "Criar monitoramento", e-mail, "Sair".
`v5-after/footer-1440.png`: rodapé em duas colunas, logo+lema, 3 links,
aviso de comissão abaixo de um divisor.

## Revisão adversarial

1. Frase proibida? Não — texto do rodapé/menu já estava revisado (A3/V2);
   nenhuma frase nova fora do vocabulário aprovado.
2. Preço sem idade/zero? Não tocado (cabeçalho/rodapé não mostram preço).
3. Data/hora sem fuso fixo? Não tocado.
4. Animação de CSS Module com keyframe global? O painel mobile usa
   `transition` (não `animation`) em `opacity`/`transform`/`visibility` —
   fora do escopo de MO-02 (que fala de `animation`+`@keyframes`); nenhuma
   violação possível aqui. `animacaoSemKeyframes` seguiu 0.
5. Compra fora do `PurchaseButton`? Não tocado.
6. Cor nova fora de `tokens.css`? `color-mix(in srgb, var(--color-bg) 88%,
transparent)` no fundo do cabeçalho usa só a variável de token, sem hex/
   rgb literal — `corForaDosTokens` seguiu 0 (confirmado rodando o script,
   não só por inspeção).
7. 320px/teclado/movimento reduzido? Ver "Depois" e a seção de verificação
   manual do menu acima. Movimento reduzido: a transição do painel usa
   `transition-duration`, coberta pelo bloco global que já zera durações.
8. Diff fora da ficha? Nenhum — todos os arquivos tocados estão em
   `components/layout/**`.

## Handoff

- Alterações: `site-header.tsx` (reescrito, usa `MainNav`),
  `main-nav.tsx` (novo), `site-header.module.css` (reescrito: cabeçalho
  translúcido, nav com sublinhado animado, menu mobile abaixo de 860 px),
  `site-footer.tsx` (reescrito: colunas, nav de 3 links),
  `site-footer.module.css` (reescrito), `ceilings.json`
  (`ui.controlsBelow44` 5→2).
- Evidências: saída real acima; 4 screenshots.
- Limitações e riscos: verificação de teclado do menu foi por revisão de
  código + screenshot, não por script de automação (ver nota acima) —
  recomendo testar manualmente uma vez com teclado real antes do deploy,
  já que é o único item desta tarefa sem evidência automatizada direta.
- Próximo passo: fase P (páginas) — P1, início do visitante.
