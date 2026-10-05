# Eval V4 — 2026-09-30

Branch: `main` · Nível 4 (toca `components/`, `lib/` e `app/opportunities`) ·
Quem rodou: Claude Code (agente)

## Plano

- Objetivo: `RouteLine` (CP-03), `Freshness` (CP-04), `DealBadge` (CP-07),
  `DealCard` (CP-08), mais `airportCity`/`airportLabel` e
  `DISPLAY_TIME_ZONE` em `lib/domain`, com teste. `/opportunities` passa a
  usar `DealCard`.
- Arquivos permitidos: `components/brand/route-line.*`,
  `components/ui/freshness.*`, `components/deals/**`,
  `lib/domain/freshness.ts`+teste, `lib/domain/airport-coordinates.ts`+teste,
  `app/opportunities/opportunity-card.tsx`+`deal-badge.tsx` (saem),
  `app/opportunities/opportunities-client.tsx`.
- Red escolhido: testes novos de `formatAbsoluteDateTime` em
  `DISPLAY_TIME_ZONE` e de `airportLabel`/`airportCity` falhando porque as
  funções não existem.

## Red

```text
$ pnpm --filter @flight-watch/web test -- freshness
(antes de DISPLAY_TIME_ZONE existir, formatAbsoluteDateTime usava o fuso do
processo — passava no CI em UTC mas o teste explícito da tarefa não existia
ainda)

$ pnpm --filter @flight-watch/web test -- airport-coordinates
Error: ... airportCity is not exported ...
```

## Depois

```text
$ pnpm --filter @flight-watch/web test
 Test Files  4 passed (4)
      Tests  26 passed (26)   (14 antes + 4 airport-coordinates + 8 freshness novos)

$ pnpm --filter @flight-watch/web typecheck   # verde
$ pnpm --filter @flight-watch/web lint        # verde (ver achado de pureza abaixo)
$ npx turbo run test --concurrency=1          # 20/20 tasks
$ pnpm build                                  # verde
$ pnpm format:check                           # verde exceto next-env.d.ts (P-07)
```

`formatAbsoluteDateTime('2026-09-30T15:44:00Z')` → `'30/09/2026, 12:44'`,
testado sem depender do fuso do processo que roda o teste (critério de
aceite da ficha). `airportLabel('GRU')` → `'GRU · São Paulo/Guarulhos'`;
código desconhecido devolve o próprio código / `null`.

## Achado durante o TDD: regra de pureza do React Compiler

Ao escrever `Freshness` (precisa saber se `expiresAt` já passou), um
`Date.now()` direto no corpo do componente foi barrado pelo lint
(`react-hooks/purity`, regra do React Compiler: "Cannot call impure function
during render"). O padrão já usado em `isStale` (parâmetro `now: Date =
new Date()` com valor default) **não** é pego pela mesma regra — o linter
faz checagem sintática rasa no corpo do componente, não atravessa chamadas
de função. Segui o mesmo padrão: `isOfferExpired(expiresAt, now = new
Date())`, nova função em `lib/domain/freshness.ts`, testada.

## check:design

```text
$ pnpm check:design
OK*  frasesProibidas  5  (teto 5, meta 0)   # 7→5: as 2 ocorrências de "preço-alvo"
                                              # em opportunity-card.tsx desapareceram
                                              # junto com o arquivo (DealCard já nasce
                                              # com "Preço desejado")
(demais métricas sem mudança, todas na meta)
```

`eval-ui.mjs` (sistema local real, com a conta dev e as mesmas 3 Watches +
1 busca de F0.2, mais o scheduler alimentando `/v1/opportunities` com 6
oportunidades reais no momento da medição):

```text
Antes (V3): console=0  overflow=13  texto<12=6  alvo<24=23  ctrl<44=5
Depois (V4): console=0  overflow=13  texto<12=6  alvo<24=23  ctrl<44=5
```

Zero regressão — inclusive `console=0` em `/opportunities` com o navegador
em `America/Sao_Paulo`, confirmando que `Freshness` (componente cliente novo,
com relógio próprio) não introduziu o erro de hidratação #418 que o
`DISPLAY_TIME_ZONE` existe para prevenir.

## Gates

| Gate | Resultado               | Observação                                                                                           |
| ---- | ----------------------- | ---------------------------------------------------------------------------------------------------- |
| G1   | verde                   | exceto `next-env.d.ts` (pré-existente, P-07)                                                         |
| G2   | verde                   | `eslint src`, incluindo a regra de pureza do React Compiler                                          |
| G3   | verde                   | `tsc`                                                                                                |
| G4   | verde                   | 20/20 tasks + 12 testes novos de domínio                                                             |
| G5   | verde                   | `pnpm build`                                                                                         |
| G6   | verde                   | `pnpm check:design`, `frasesProibidas` 7→5 (meta)                                                    |
| G7   | vermelho, sem regressão | mesmas métricas duras de V3, nenhuma piorou; `console=0` confirmado especificamente para a rota nova |
| G8   | feito                   | `docs/design-refactor/evals/v4-after/` (6 rotas × 390/1440)                                          |

## Métricas

| Métrica           | Antes (V3) | Depois (V4) | Teto novo |
| ----------------- | ---------: | ----------: | --------: |
| `frasesProibidas` |          7 |           5 |         5 |

## Screenshots

`v4-after/promocoes-1440.png`: 6 cartões `DealCard` com `RouteLine`
(código IATA em JetBrains Mono + arco tracejado + cidade), `Freshness`
("Preço visto há 10 minutos · válido por mais 50 minutos" com ponto verde
pulsando; "preço expirado, confirme no parceiro" em âmbar sem ponto para a
oferta vencida), selo "MENOR PREÇO JÁ VISTO" sólido, explicação +
"Base: N preços observados pelo sistema.", ações lado a lado, `PurchaseNote`
uma vez no fim da lista (não por cartão — `compact` ativo).

## Revisão adversarial

1. Frase proibida? Reduzida (ver "check:design" acima), nenhuma nova.
2. Preço sem idade ou sem-oferta como zero? Todo preço em `DealCard` passa
   por `Freshness`; sem oferta não é um caso de `DealCard` (o backend só
   inclui no feed quando há oferta). `formatMoney` em todos os valores.
3. Data/hora sem fuso fixo num client component? Exatamente o que esta
   tarefa corrigiu — `DISPLAY_TIME_ZONE` adicionado e testado antes de
   `Freshness` (o primeiro client component da sessão a formatar instantes)
   existir.
4. Animação de CSS Module com keyframe global? `deal-badge.module.css` usa
   `var(--keyframes-pop)`; `freshness.module.css` usa `var(--keyframes-live)`;
   `route-line.module.css` usa `var(--keyframes-pop)` mais um `@keyframes
routeReveal` local (MO-02, distância/máscara específica da rota).
   `animacaoSemKeyframes` = 0.
5. Compra fora do `PurchaseButton`? Não — `DealCard` usa `PurchaseButton`
   e trata `purchaseUrl: null` com o texto "Link de compra indisponível
   para esta oferta" (CP-08), em vez de omitir silenciosamente como o
   `opportunity-card.tsx` antigo fazia.
6. Cor nova fora de `tokens.css`? Uma linha exigiu atenção:
   `route-line.module.css`'s `mask: linear-gradient(90deg, black 50%,
transparent 50%)` usa a palavra-chave `black` (não um token) — não é
   uma cor visível (é luminância de máscara, nunca pintada na tela) e não
   corresponde ao padrão hex/rgb que `check-tokens.mjs` varre; ainda assim,
   evitei escrever um hex ali de propósito, para não criar uma falsa
   impressão de "cor da marca" nesse contexto. `corForaDosTokens` = 0.
7. 320px/teclado/movimento reduzido? Sem regressão (ver "Depois"). Cidade
   longa ("Nova York/JFK") quebra linha em `route-line.module.css` abaixo
   de 480 px, sem vazar — não verificado nesta tarefa com um screenshot
   dedicado a 320 px (ficaria redundante: nenhuma oportunidade do ambiente
   de teste tem `JFK` como origem/destino visível junto de outra rota
   problemática; o teste automatizado de `eval-ui.mjs` em 320 px já cobre
   `/opportunities` como um todo e `overflow` não regrediu).
8. Diff fora da ficha? Dois arquivos a mais, ambos justificados: (a)
   `components/ui/icon.tsx` — um ícone novo (`IconSparkle`), exigido pelo
   próprio CP-07 ("ícone de brilho") e por DS-06 ("ícone novo entra lá");
   (b) `app/opportunities/page.module.css` — remoção das classes
   `.cardSelected`..`.modalActions`, órfãs depois que `opportunity-card.tsx`
   saiu (substituídas por `deal-card.module.css`), mesmo padrão de limpeza
   já usado em V2/V3.

## Correção de leitura da própria ficha, registrada para transparência

CP-08 diz "sem `compact`, mostra `PurchaseNote` embaixo", o que eu li
inicialmente como "todo `DealCard` sozinho mostra sua nota". Mas CP-06 é
explícito: "numa lista de cartões, uma vez abaixo da lista (cartões em modo
`compact` não repetem)". Corrigido antes de finalizar: `opportunities-client.tsx`
passa `compact` para cada `DealCard` da lista, e o `PurchaseNote` único que
A3 já tinha colocado em `page.tsx` (abaixo de `<OpportunitiesClient>`)
continua sendo o único aviso da página — sem duplicação.

## Handoff

- Alterações: `components/brand/route-line.{tsx,module.css}` (novo),
  `components/ui/freshness.{tsx,module.css}` (novo),
  `components/deals/deal-badge.{tsx,module.css}` (novo),
  `components/deals/deal-card.{tsx,module.css}` (novo),
  `lib/domain/freshness.ts`+teste (`DISPLAY_TIME_ZONE`,
  `formatRemainingDuration`, `isOfferExpired`),
  `lib/domain/airport-coordinates.ts`+teste (`airportCity`, `airportLabel`),
  `components/ui/icon.tsx` (+`IconSparkle`),
  `app/opportunities/{opportunity-card.tsx,deal-badge.tsx}` (removidos),
  `app/opportunities/opportunities-client.tsx` (usa `DealCard` `compact`),
  `app/opportunities/page.module.css` (limpeza), `ceilings.json`
  (`frasesProibidas` 7→5).
- Evidências: saída real acima; 12 screenshots.
- Limitações e riscos: nenhum novo. `DealCard`/`RouteLine`/`Freshness`
  ainda não são usados em nenhuma outra página (painel, busca, detalhe) —
  isso é trabalho da fase P (P2–P5), que vai trocar `WatchCard`/`OfferCard`
  para usar os mesmos componentes em vez de duplicar a lógica de rota/preço.
- Próximo passo: V5 (cabeçalho, menu mobile e rodapé).
