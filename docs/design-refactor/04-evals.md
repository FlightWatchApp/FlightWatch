# 04 — Evals do refactor web v2

Complementa `docs/EVALS.md` com o mesmo formato
(`id`, dado, quando, então, limiar). Regra de lá que continua valendo: se a
regra é determinística, o eval é determinístico; não se usa média para esconder
falha grave.

Como registrar: cada tarefa fecha com um arquivo
`docs/design-refactor/evals/AAAA-MM-DD-<tarefa>.md` (modelo em
`templates/registro-eval.md`) com a saída real dos comandos, antes e depois.

## Ferramentas

| Ferramenta                          | Mede                                                   | Precisa de                            |
| ----------------------------------- | ------------------------------------------------------ | ------------------------------------- |
| `node scripts/design/check-all.mjs` | código: frases, cor, contraste, keyframes, compra      | só Node ≥ 20                          |
| `node scripts/design/eval-ui.mjs`   | navegador: console, overflow, fonte, toque, animação   | web rodando + Playwright fora do repo |
| testes Vitest (`pnpm test`)         | domínio, contratos, API (Testcontainers), `lib/domain` | Docker para a API                     |
| rubrica visual                      | o que só olho humano julga                             | screenshots 390 e 1440                |

`check-all.mjs` é catraca: cada métrica tem teto em
`scripts/design/ceilings.json`. A tarefa que melhora uma métrica **baixa o
teto no mesmo PR**. Teto só sobe com decisão registrada em `09-decisoes.md`.

## Afiliado (SPEC-020)

```yaml
id: EVAL-AFF-001
purpose: link de compra ganha parâmetros de afiliado
given: AFFILIATE_TRACKING_PARAMS='{"SIMULATED":{"marker":"123456"}}' e uma promoção com deeplink allowlisted
when: GET /v1/opportunities
then: offer.purchaseUrl tem marker=123456, utm_source=flightwatch, utm_medium=affiliate, utm_campaign=opportunity; host e caminho iguais ao deeplink
threshold: aprovação integral
fixtures: SimulatedFlightProvider
owner: api/opportunities
```

- **EVAL-AFF-002** provider sem configuração → `purchaseUrl` byte a byte igual
  ao de SPEC-018.
- **EVAL-AFF-003** deeplink fora da allowlist + afiliado configurado →
  `purchaseUrl: null` (na superfície `WATCH`, `purchase_link_missing_total`
  continua incrementando como em SPEC-018).
- **EVAL-AFF-004** JSON malformado, raiz array, valor com `&` ou `/` → API sobe,
  log `affiliate_config_invalid` uma vez, links sem parâmetro.
- **EVAL-AFF-005** configuração com `utm_source` → tratada como inválida.

## Interface: código (`check-all.mjs`)

| ID                   | Métrica                  | Limiar | Regra    |
| -------------------- | ------------------------ | -----: | -------- |
| EVAL-UI-COPY-001     | `frasesProibidas`        |      0 | BR-04    |
| EVAL-UI-TOKENS-001   | `corForaDosTokens`       |      0 | DS-01    |
| EVAL-UI-CONTRAST-001 | `contrasteAbaixo`        |      0 | DS-02    |
| EVAL-UI-MOTION-001   | `animacaoSemKeyframes`   |      0 | MO-02    |
| EVAL-UI-MOTION-003a  | `semMovimentoReduzido`   |      0 | MO-04    |
| EVAL-UI-PURCHASE-001 | `blankSemNoopener`       |      0 | CP-05    |
| EVAL-UI-PURCHASE-002 | `compraSemSponsored`     |      0 | SPEC-020 |
| EVAL-UI-PURCHASE-003 | `paginaSemAvisoComissao` |      0 | CP-06    |
| EVAL-UI-PURCHASE-004 | `semPaginaTransparencia` |      0 | PG-09    |

Baseline em `fa57198`: 8 · 1 · 6 · 0 · 0 · 0 · 3 · 4 · 1. Implementação de
referência: todos 0.

Limites conhecidos, para não confiar demais:

- `check-copy` lê código de produto sem comentários; texto que vem da API
  (`deal.explanation`) é coberto pelos testes de SPEC-015, não por aqui;
- `check-purchase` segue imports estáticos a partir de cada `page.tsx`; um aviso
  renderizado só sob condição conta como presente. A rubrica R6 confere na tela.

## Interface: navegador (`eval-ui.mjs`)

Rotas: as de `03-spec-paginas.md`. Larguras 320, 390 e 1440. Navegador em
`America/Sao_Paulo`, `pt-BR`.

```yaml
id: EVAL-UI-HYDRATION-001
purpose: nenhuma página quebra a hidratação nem gera erro de console
given: web em modo produção (next build + next start), servidor em UTC, navegador em America/Sao_Paulo
when: cada rota abre em 320, 390 e 1440
then: nenhum console.error, pageerror ou resposta HTTP >= 400
threshold: 0
owner: web
```

| ID                    | Coluna na saída | Limiar          | Regra |
| --------------------- | --------------- | --------------- | ----- |
| EVAL-UI-HYDRATION-001 | `console`       | 0               | DS-07 |
| EVAL-UI-RESP-001      | `overflow`      | 0 px            | DS-04 |
| EVAL-UI-TYPE-001      | `texto<12`      | 0               | DS-03 |
| EVAL-UI-TOUCH-001     | `alvo<24`       | 0 (em 390)      | DS-04 |
| EVAL-UI-TOUCH-002     | `ctrl<44`       | catraca, meta 0 | DS-04 |
| EVAL-UI-MOTION-002    | `anim-quebrada` | 0               | MO-02 |
| EVAL-UI-MOTION-003    | `anim-c/reduce` | 0               | MO-04 |

O script sai com código 1 se qualquer limiar "0" falhar ou se `ctrl<44`
passar do teto `ui.controlsBelow44` de `ceilings.json` (preenchido na F0.2).

Na implementação de referência (2026-09-30) todos deram 0. Antes de chegar lá,
estes evals acharam quatro defeitos reais, que servem de exemplo do tipo de
coisa que pegam: `formatAbsoluteDateTime` sem fuso fixo (erro #418 em toda
página com `Freshness` no fuso do Brasil), `<title>` de SVG com vários filhos
(erro #418 no detalhe), grid `1fr` e cidade sem quebra (rolagem horizontal em
320 px) e links com 18 a 22 px de altura.

## Interface: estado e conteúdo

Checados por teste unitário quando a lógica é pura, e pela rubrica quando é
apresentação.

- **EVAL-UI-STATE-001** Watch sem observação, com oferta expirada, com dado
  velho (> 48 h) e pausado: quatro textos e cores distintos; nenhum mostra
  `R$ 0,00` (H04). Base: `lib/domain/watch-price.test.ts`,
  `freshness.test.ts` + screenshot do painel com os quatro casos.
- **EVAL-UI-DEAL-001** todo `DealCard` mostra selo, `Freshness`, rota,
  datas, preço, motivo (`deal.explanation`), base (N preços), comprar e
  monitorar (CP-08). Verificação: rubrica R6 em `/opportunities` e na home.
- **EVAL-UI-TIME-001** `formatAbsoluteDateTime('2026-09-30T15:44:00Z')` é
  `30/09/2026, 12:44` com `TZ=UTC` e com `TZ=America/Campo_Grande`
  (unitário).

## Interface: acessibilidade manual

**EVAL-UI-A11Y-001** percurso de teclado em 1440 e 390, registrado no eval da
tarefa:

1. Tab a partir do topo: "Pular para o conteúdo" aparece e funciona.
2. Todo controle recebe foco visível (`--color-focus-ring`).
3. Menu do celular: abre com Enter, `aria-expanded` muda, Esc fecha e o foco
   volta ao botão.
4. Modal "Monitorar este preço": foco entra no campo, Esc fecha, foco volta a
   "Monitorar preço".
5. Leitor de tela (VoiceOver ou NVDA, se disponível): `RouteLine` lê "GRU para
   MIA"; botão de compra lê o contexto e "abre o site parceiro em nova aba".

axe-core automatizado depende da decisão P-03.

## Rubrica visual

**EVAL-UI-VISUAL-001** `templates/rubrica-visual.md`: 8 critérios de 1 a 5,
comparando screenshots 390 e 1440 da tarefa com `referencia-visual/`. Limiar:
nenhum critério abaixo de 4. Quem dá a nota final é o owner; o agente pode
fazer uma pré-avaliação, marcada como tal, e nunca aprova sozinho.

## Suítes por momento

| Suíte      | Quando                         | Conteúdo                                                      |
| ---------- | ------------------------------ | ------------------------------------------------------------- |
| Rápida     | a cada mudança                 | teste do package afetado + `check-all.mjs`                    |
| Tarefa     | antes de abrir PR              | gates do repo + `check-all.mjs` + `eval-ui.mjs` + screenshots |
| Fase       | ao fim de A, V, P              | tudo acima em todas as rotas + A11Y-001 + rubrica             |
| Final (Z2) | antes de pedir merge da última | tudo, com a meta 0 em todos os tetos e a rubrica assinada     |
