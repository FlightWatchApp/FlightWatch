# Flight Watch — Design system do web

Mapa operacional do que existe em `apps/web/src/styles` e
`apps/web/src/components` depois do refactor v2 (SPEC-021). Não repete o
que o código já expressa com clareza (nomes de token, props); descreve a
regra transversal e onde cada peça se aplica. Escrito a partir do ponto de
partida de `ref/redesign` (git ref local), corrigido onde o código real
implementado nesta sessão diverge dele — as divergências estão marcadas
explicitamente.

## Tokens (`styles/tokens.css`)

- **Primitivos** `--fw-*`: paleta crua (petróleo, papel, tinta, laranja
  rota, verde, âmbar, vermelho). Só os tokens semânticos devem ser usados
  em componentes; os primitivos aparecem só em acentos pontuais sobre
  fundo escuro (`--fw-route-300`, destino do `BrandSymbol`/benefícios do
  `AuthShell` sobre o painel petróleo).
- **Semânticos** `--color-*`: `bg`, `surface`, `surface-sunken`, `border[-strong|-on-dark]`,
  `overlay`, `text-primary/secondary/muted/on-dark[-muted]/on-accent`,
  `brand[-strong]`, `action[-hover]`, `route[-text|-soft|-glow]`,
  `success/warning/danger` (cada um com `-soft-bg`/`-soft-text`/`-border`),
  `focus-ring`.
- **Tipo**: `--font-display`/`--font-body` apontam para Instrument Sans,
  `--font-mono` para JetBrains Mono (só `.iata`, código IATA e técnico).
  Escala `--text-xs` … `--text-4xl`; `--leading-tight/snug/normal`.
- **Espaço**: base 4px, `--space-1` … `--space-24`.
- **Raio**: `--radius-sm` 6px (controles pequenos), `-md` 10px (botões e
  campos), `-lg` 16px (cartões), `-full` pílula (selos).
- **Sombra**: `--shadow-sm/md/lg`, só em elementos que flutuam (`Modal`,
  cartão sobreposto no hero de `/search`) ou respondem ao ponteiro.
- **Movimento**: `--duration-fast/base/slow/draw`, `--easing-standard/out`.
  Todos zeram para `0ms` sob `prefers-reduced-motion: reduce`
  (`@media` dentro do próprio `tokens.css`).
- **Keyframes**: `--keyframes-reveal/fade-in/draw/pop/live/spin` apontam
  para `@keyframes fw-*` definidos em `globals.css`. Regra obrigatória
  (MO-02, verificada por `scripts/design/check-css-modules.mjs`): nenhum
  `*.module.css` escreve o nome global direto em `animation`/
  `animation-name` — CSS Modules renomeia esses identificadores e a
  animação simplesmente não roda, sem erro visível. Sempre
  `var(--keyframes-*)` ou um `@keyframes` local ao próprio módulo.

## Regras de conteúdo (herdadas do produto, `CLAUDE.md` §2.3)

- Preço sempre com a idade: `Freshness` mostra "Observado há X · válido
  por mais Y" (ou prefixo customizado, ex. "Preço visto" em
  `search/[id]`) e troca para "preço expirado, confirme no parceiro" em
  âmbar quando a oferta vence.
- Rótulos obrigatórios: "Último preço observado", "Menor preço observado"
  (nunca "pelo sistema" sozinho fora de contexto — o texto completo da
  home é "menor preço observado pelo sistema"), "Preço desejado". Nunca
  "garantido", "tempo real", "menor preço do mercado", "desconto" solto,
  "preço-alvo" — lista completa e regex em
  `scripts/design/check-copy.mjs`.
- Sem oferta não é zero: `PriceHistoryChart` nunca desenha um ponto para
  observação ausente; a UI mostra ausência como estado próprio, nunca
  R$ 0,00.
- Todo CTA de compra passa por `PurchaseButton` (único lugar que pode
  renderizar `<a>` para o parceiro — `rel="noopener noreferrer sponsored"`,
  `target="_blank"`) + `PurchaseNote` ao lado (uma vez por lista quando o
  contexto é `compact`, uma vez por cartão quando não é — ver tabela de
  componentes).

## Componentes

| Componente                                                                                                                                                                                                       | Onde                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `brand/BrandSymbol`, `brand/Logo`                                                                                                                                                                                | cabeçalho, rodapé, `AuthShell`                               |
| `brand/RouteLine`                                                                                                                                                                                                | toda rota: IATA → arco animado → IATA, com `showCities?`     |
| `deals/DealCard`, `deals/DealBadge`                                                                                                                                                                              | home (`compact`), `/opportunities` (não `compact`), painel   |
| `purchase/PurchaseButton`, `purchase/PurchaseNote`                                                                                                                                                               | watch, detalhe, oferta de busca, oportunidade                |
| `account/AuthShell`                                                                                                                                                                                              | `/login`, `/register` (painel de marca ≥ 960px + formulário) |
| `home/Landing`, `home/HeroIllustration`                                                                                                                                                                          | `/` para visitante não autenticado                           |
| `watches/PriceHistoryChart`                                                                                                                                                                                      | `/watches/:id`                                               |
| `watches/WatchCard`, `watches/WatchLifecycleActions`                                                                                                                                                             | painel, `/watches/:id`                                       |
| `layout/SiteHeader`, `layout/MainNav`, `layout/SiteFooter`                                                                                                                                                       | em toda página (`app/layout.tsx`)                            |
| `ui/Freshness`                                                                                                                                                                                                   | idade e validade de um preço (watch, detalhe, oferta)        |
| `ui/Button`, `ui/IconButton`, `ui/Modal`, `ui/ConfirmDialog`, `ui/InlineAlert`, `ui/StatusTag`, `ui/Skeleton`, `ui/EmptyState`, `ui/FormField`, `ui/TextInput`, `ui/Select`, `ui/Card`, `ui/Tooltip`, `ui/Icon*` | base de UI, todo o produto                                   |

**Divergência corrigida de `ref/redesign`**: a versão de referência descreve
`PurchaseButton` com uma seta que desliza no hover e um estado de clique
"Abrindo o parceiro…". O componente implementado (`components/purchase/
purchase-button.tsx`) não tem nenhum dos dois — é um `<a>` com rótulo fixo
("Comprar passagem" ou "Atualizar preço" conforme `status`), `IconExternalLink`
fixo ao lado e um `<span className="visually-hidden">` anunciando "abre o
site parceiro em nova aba" para leitor de tela. Mais simples que a
referência; documentado aqui como o comportamento real, não o da
referência.

## Movimento (MO-01..MO-03)

Curto, com desaceleração, uma vez só por padrão. Nada em loop além do
ponto "ao vivo" de uma oferta válida (`Freshness`).

| Onde                          | O que acontece                                                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `Logo`/`BrandSymbol` animados | a rota decola, a lente aparece, pousa no destino (~1,4s total, uma vez)                                                                  |
| `.reveal` (utilitário global) | bloco sobe 12px e aparece; escalonado por `--reveal-delay` inline, em blocos de página — nunca por cartão de lista (MO-03)               |
| `HeroIllustration` (home)     | avião percorre o arco, série de preço fixa "Exemplo" 1.480 → 1.212, gráfico desenha, selo de promoção aparece (~2s)                      |
| `RouteLine` (`animated`)      | arco se revela da origem ao destino                                                                                                      |
| `PriceHistoryChart`           | linha desenha (`stroke-dashoffset`), pontos aparecem, último ponto em laranja (`pop`), tabela equivalente sempre presente em `<details>` |
| `DealBadge`/selos de promoção | `pop` curto ao entrar                                                                                                                    |
| `Modal`                       | `<dialog>` nativo, fundo desfocado (`backdrop-filter`), painel sobe 8px em 220ms                                                         |
| `Freshness` (oferta válida)   | ponto verde pulsando em loop — única animação em loop do produto                                                                         |
| `verify-email` (ícone 40px)   | `pop` ao entrar na página                                                                                                                |

`prefers-reduced-motion: reduce` zera `--duration-*` para `0ms` — todo
elemento animado termina no estado final visível instantaneamente, sem
precisar de uma regra por componente. Exceção: `PriceHistoryChart` tem um
`@media (prefers-reduced-motion: reduce)` próprio em
`price-history-chart.module.css` para congelar explicitamente o traço e o
último ponto no estado final (a composição de `stroke-dasharray` com
duração zero por si só não garante visualmente o resultado correto nesse
caso específico).

**Achado de metodologia, não de produto** (documentado em detalhe no eval
de P7, `docs/design-refactor/evals/2026-10-01-P7-conta.md`): o Playwright,
ao tirar um screenshot de página inteira (`fullPage: true`) que exige
redimensionar a viewport internamente, pode capturar uma animação
`forwards`+`var(--keyframes-*)` já terminada como se estivesse no quadro
inicial (oculta). `getComputedStyle()`, uma captura isolada do elemento e
um redimensionamento real de viewport confirmaram que o navegador — e
portanto o usuário real — sempre vê o estado final correto; é uma
armadilha só do mecanismo interno de composição de screenshot do
Playwright quando precisa redimensionar. Relevante para quem for capturar
evidência de telas altas com animação de entrada em tarefas futuras.

## Acessibilidade

- Foco visível em todo controle via `:focus-visible` global
  (`--color-focus-ring`), nunca dependente só de `:hover`.
- Alvo de toque: **não é um mínimo único de 44px em tudo** (divergência da
  referência) — a regra real, imposta por `scripts/design/eval-ui.mjs`, é
  dupla: link de texto solto (`<a>` dentro de `p`/`td`/`dd`/`figcaption`/
  `small`) precisa de no mínimo 24px de altura; qualquer controle
  (`button`, ou `<a>` fora desse contexto — ex. `PurchaseButton`, item de
  navegação, cartão clicável) precisa de no mínimo 44px. `ui.controlsBelow44`
  é catraca em `scripts/design/ceilings.json`, hoje no teto final (0).
- `RouteLine` tem `aria-label` lendo "GRU para MIA" (ou com cidades, quando
  `showCities`); o arco e os símbolos internos são `aria-hidden`.
- Painel de marca do `AuthShell` é inteiramente `aria-hidden` — decorativo,
  mesmo tratamento de `HeroIllustration`; o conteúdo funcional (título,
  subtítulo, formulário, rodapé) vive só na coluna do formulário.
- `PriceHistoryChart` tem `aria-label` resumido no `<svg>` e uma tabela
  completa e equivalente em `<details><summary>Ver histórico em tabela
(N)</summary>…</details>` — nunca só o gráfico.
- Todo link de compra anuncia "(abre o site parceiro em nova aba)" via
  `<span className="visually-hidden">`, com contexto opcional antes
  ("GRU para MIA por R$ 1.083,91, abre o site parceiro em nova aba").
- Menu mobile (`MainNav`, < 860px): `aria-expanded`/`aria-controls`, Esc
  fecha e devolve o foco ao botão que abriu — verificado por revisão de
  código e screenshot nesta sessão (V5); recomendado um teste manual com
  teclado real antes de produção, já que a automação headless não
  localizou o botão pelo nome acessível neste ambiente.

## Quality gates do pacote (`scripts/design/`)

Script único, `pnpm check:design` (`scripts/design/check-all.mjs`), soma:

| Métrica                  | Script                  | Verifica                                                                                                                          |
| ------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `frasesProibidas`        | `check-copy.mjs`        | as 7 frases/regex proibidas (ver "Regras de conteúdo")                                                                            |
| `animacaoSemKeyframes`   | `check-css-modules.mjs` | `animation`/`animation-name` em `*.module.css` sem `@keyframes` local nem `var(--keyframes-*)`                                    |
| `semMovimentoReduzido`   | `check-css-modules.mjs` | existe `@media (prefers-reduced-motion: reduce)` em `globals.css`/`tokens.css`                                                    |
| `corForaDosTokens`       | `check-tokens.mjs`      | hex/rgb literal fora de `tokens.css` (exceção única e documentada: `themeColor` do `viewport` em `layout.tsx`, exigência do Next) |
| `contrasteAbaixo`        | `check-contrast.mjs`    | pares de cor semântica abaixo de WCAG AA                                                                                          |
| `blankSemNoopener`       | `check-purchase.mjs`    | `target="_blank"` sem `rel="noopener noreferrer"`                                                                                 |
| `compraSemSponsored`     | `check-purchase.mjs`    | link de compra sem `sponsored` no `rel`                                                                                           |
| `paginaSemAvisoComissao` | `check-purchase.mjs`    | página com CTA de compra sem `PurchaseNote`                                                                                       |
| `semPaginaTransparencia` | `check-purchase.mjs`    | ausência de `/transparencia` ou de link para ela                                                                                  |

Separado, `node scripts/design/eval-ui.mjs` (precisa de Playwright instalado
fora do repositório — decisão pendente P-03, instruções no cabeçalho do
próprio script) mede em navegador real, por rota e por largura: erros de
console, overflow horizontal, texto abaixo de 12px, `alvo<24`, `ctrl<44`,
animação sem `@keyframes` resolvido e animação ainda rodando sob
`prefers-reduced-motion`.

`scripts/design/ceilings.json` é a catraca: todo teto só desce quando uma
tarefa melhora a métrica de verdade, nunca sobe sem decisão registrada.
Estado ao fim desta sessão (P7, 2026-10-01): toda métrica de
`check:design` está na meta final de 0; `eval-ui.mjs` também está em 0 em
todas as colunas, exceto 1 ocorrência de `alvo<24` (o "← Voltar" de
`search/[id]`, documentado como fora do escopo de cada ficha que passou
por aquele diretório — ver `docs/design-refactor/PROGRESS.md`).
