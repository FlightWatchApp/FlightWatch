# Eval P1 — 2026-09-30

Branch: `main` · Quem rodou: Claude Code (agente)

## Plano

- Objetivo: landing de PG-01 para visitante (hero + ilustração animada,
  promoções da API, como funciona, confiança, faixa final), sem mudar o
  painel logado (P2).
- Arquivos permitidos: `components/home/**` (novo), `app/page.tsx` (ramo sem
  sessão), `app/page.module.css`.
- Mudança de comportamento real: `/` sem sessão **parava de redirecionar
  para `/login`** e passa a mostrar a landing — isso é o próprio objetivo de
  PG-01 (hoje a home de visitante nem existia como conceito; o fluxo antigo
  tratava "sem sessão" como erro).
- Red escolhido: `curl -s localhost:3100/ | rg "Promoções agora"` sem
  resultado (antes: 307 para `/login`).

## Red

```text
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/   # antes: 307
$ curl -s http://localhost:3100/ | rg "Promoções agora"            # antes: sem saída
```

## Depois

```text
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/   # 200
$ pnpm --filter @flight-watch/web typecheck   # verde
$ pnpm --filter @flight-watch/web lint        # verde
$ npx turbo run test --concurrency=1          # 20/20 tasks
$ pnpm build                                  # verde
$ pnpm format:check                           # verde exceto next-env.d.ts (P-07)
$ pnpm check:design                           # sem mudança
```

`eval-ui.mjs` na rota `inicio` (agora a landing real, antes um redirecionamento
que o navegador seguia até `/login`):

```text
console=0  overflow=0  texto<12=0  alvo<24=0  ctrl<44=0
```

Totais do site inteiro idênticos aos de V5 — nenhuma regressão em nenhuma
outra rota.

## Decisão de implementação: `app/page.tsx`

`getCurrentUser()` passa a ser chamado **antes** de `listWatches()`
(que exige sessão). Antes, os dois eram chamados em paralelo
(`Promise.all`) e um 401 de qualquer um dos dois disparava o redirecionamento
— o que também capturava silenciosamente o caso "sem sessão nenhuma" como se
fosse um erro. Agora: sem usuário → `<Landing>`; com usuário →
`listWatches()` continua com o mesmo try/catch de 401 → redirecionamento
(defesa para sessão invalidada entre as duas chamadas), e todo o JSX do
painel abaixo dessa checagem **não foi tocado** — é literalmente o mesmo
código de antes, só federado atrás do `if (!user)`. P2 vai redesenhá-lo.

## Gates

| Gate | Resultado          | Observação                                                                                                            |
| ---- | ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| G1   | verde              | exceto `next-env.d.ts` (pré-existente, P-07)                                                                          |
| G2   | verde              | `eslint src`                                                                                                          |
| G3   | verde              | `tsc`                                                                                                                 |
| G4   | verde              | 20/20 tasks                                                                                                           |
| G5   | verde              | `pnpm build`                                                                                                          |
| G6   | verde              | `pnpm check:design` sem mudança (home visitante não tem compra ainda além do que `PurchaseNote`/`DealCard` já cobrem) |
| G7   | verde na rota nova | `inicio`: console=0, overflow=0, alvo<24=0, ctrl<44=0 — zero defeito na rota inteiramente nova                        |
| G8   | feito              | `docs/design-refactor/evals/p1-after/landing-{390,1440}.png`                                                          |

## Métricas

Nenhuma métrica de `ceilings.json` muda (home visitante não introduz compra/
cor/contraste novos — reaproveita `DealCard`/`PurchaseNote`/`Button` já
auditados). `eval-ui.mjs` para a rota `inicio` foi de "redirecionamento
seguido pelo navegador até `/login`" para uma página própria com todos os
indicadores em zero.

## Screenshots

`p1-after/landing-1440.png` e `landing-390.png`: hero com ilustração
("Exemplo", GRU→MIA, R$ 1.212,00, "↘ 18% em 14 dias"), 3 `DealCard` reais da
API em "Promoções agora", 3 passos em "Como funciona", bloco de confiança
com link para `/transparencia`, faixa final petróleo com "Criar conta
grátis". Em 390 px tudo empilha em uma coluna, nada vaza.

## Revisão adversarial

1. Frase proibida? Não — texto novo revisado contra BR-04 antes de escrever
   (nenhuma das 8 frases proibidas aparece); `check-copy.mjs` confirma.
2. Preço sem idade ou sem-oferta como zero? Os 3 `DealCard` da seção
   "Promoções agora" já vêm com `Freshness`/`formatMoney` (herdados de V4);
   a ilustração do hero é dado fixo e fictício, claramente rotulado
   "Exemplo" tanto visualmente quanto no `aria-label`.
3. Data/hora sem fuso fixo num client component? `Landing`/`HeroIllustration`
   são Server Components (sem `'use client'`, sem estado) — não formatam
   nenhum instante dinâmico; os únicos horários vêm de dentro de `DealCard`
   (`Freshness`, já corrigido em V4).
4. Animação de CSS Module com keyframe global? `hero-illustration.module.css`
   usa `var(--keyframes-reveal/pop/fade-in/draw/live)` em todo lugar — nenhum
   nome global escrito direto. `landing.module.css`'s `.reveal` (classe
   global de `globals.css`, não deste módulo) é aplicada via `className`,
   não `animation:` dentro do módulo — não se aplica a regra do CSS Modules
   aqui. `animacaoSemKeyframes` = 0.
5. Compra fora do `PurchaseButton`? O botão "Comprar passagem ↗" dentro da
   ilustração do hero é texto decorativo dentro de `aria-hidden="true"` —
   não é um link real, não navega, não é "renderizar um link de compra" (não
   tem `href`); `check-purchase.mjs` não o detecta como âncora. Os 3
   `DealCard` reais usam `PurchaseButton` normalmente (herdado).
6. Cor nova fora de `tokens.css`? Não — `stopColor="var(--color-brand)"` no
   gradiente SVG usa variável, não hex; `corForaDosTokens` = 0.
7. 320px/teclado/movimento reduzido? `overflow` = 0 na rota inteira (ver
   "Depois"). Movimento reduzido: `.plane` (avião animado por SMIL) vira
   `display: none` em `@media (prefers-reduced-motion: reduce)` — único caso
   desta sessão em que a animação é puramente decorativa (sem conteúdo
   perdido ao sumir, diferente de opacity:0 esperando animação).
8. Diff fora da ficha? Nenhum.

## Handoff

- Alterações: `components/home/{landing,hero-illustration}.{tsx,module.css}`
  (novos), `app/page.tsx` (ramo sem sessão + `safeOpportunities` helper,
  ramo com sessão intocado).
- Evidências: saída real acima; 2 screenshots full-page.
- Limitações e riscos: nenhum. `app/page.module.css` não precisou de nenhuma
  classe nova (a landing tem seu próprio `landing.module.css`).
- Próximo passo: P2 (painel e `WatchCard`).
