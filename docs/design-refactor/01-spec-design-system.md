# 01 — Spec do design system, movimento e marca

Detalha SPEC-021 §"Identidade visual" e §"Movimento". Cada regra tem um ID
citado nas fichas de tarefa, nos PRs e nos evals. "Verificação" diz como a
regra é medida; regra sem verificação automática entra na rubrica visual
(`templates/rubrica-visual.md`).

Princípio geral: **profissional e sóbrio, mas bonito e atrativo**. A marca é um
observador atento e honesto de preços: nada de gritaria de "promoção
imperdível". Beleza vem de tipografia, espaço, uma paleta contida e poucas
animações com significado.

## DS — Design system

### DS-01 Cor só por token

- Primitivos `--fw-*` e semânticos `--color-*` moram em
  `apps/web/src/styles/tokens.css`. Nenhum hex, `rgb()` ou `rgba()` fora desse
  arquivo (exceção única: `themeColor` no `viewport` de `app/layout.tsx`, que o
  Next exige literal).
- Componentes usam **semânticos**. Primitivo só como acento sobre fundo escuro
  (`--fw-route-300`).
- Paleta (valores de referência, `docs/BRAND.md` §Cores):

  | Primitivo                      | Hex       | Papel semântico principal                      |
  | ------------------------------ | --------- | ---------------------------------------------- |
  | `--fw-paper`                   | `#F5F3EE` | `--color-bg`                                   |
  | `--fw-surface`                 | `#FFFFFF` | `--color-surface`                              |
  | `--fw-ink-900` / `700` / `500` | `#14212B` | `--color-text-primary` / `secondary` / `muted` |
  | `--fw-petrol-700` / `900`      | `#0F4C5C` | `--color-brand`, `--color-action` / `-strong`  |
  | `--fw-route-500`               | `#C4622D` | `--color-route`: destino, só gráfico (3:1)     |
  | `--fw-route-700`               | `#9C4516` | `--color-route-text`: texto na cor da rota     |
  | `--fw-route-300`               | `#E8834F` | destino sobre petróleo                         |
  | `--fw-green-700`               | `#1D6B45` | `--color-success`: só preço favorável          |
  | `--fw-amber-700`               | `#7F5200` | `--color-warning`: só atenção, dado antigo     |
  | `--fw-red-700`                 | `#A8261D` | `--color-danger`: só erro e ação destrutiva    |

- Tokens semânticos obrigatórios além dos de texto e fundo: `--color-overlay`,
  `--color-route-glow`, `--color-text-on-dark-muted`, `--color-border-on-dark`,
  `--color-success-border`, `--color-warning-border`, `--color-danger-border`,
  `--color-focus-ring`.
- Laranja nunca é fundo grande nem texto corrido: ele marca o destino.
  Verde, âmbar e vermelho têm um significado cada; não use como decoração.

Verificação: `check-tokens.mjs` (`corForaDosTokens` = 0).

### DS-02 Contraste

- Texto normal ≥ 4,5:1; texto grande, borda de controle, anel de foco e
  elementos gráficos ≥ 3:1.
- Os pares medidos estão em `scripts/design/check-contrast.mjs` (`PAIRS`).
  Par novo usado na interface entra na lista no mesmo PR.
- Valores da referência: tinta sobre papel 14,8:1; muted sobre papel 5,4:1;
  branco sobre petróleo 9,5:1; texto de rota sobre papel 5,8:1; borda forte
  sobre branco 3,8:1; `--color-route` sobre papel 3,7:1 (por isso só gráfico).

Verificação: `check-contrast.mjs` (`contrasteAbaixo` = 0).

### DS-03 Tipografia

- **Instrument Sans** (Google Fonts, OFL) para tudo, via `next/font/google`,
  variável `--font-instrument`. Títulos 600 com `letter-spacing: -0.02em`;
  texto 400/500.
- **JetBrains Mono** 500/600, variável `--font-jetbrains`, **só** para códigos
  IATA (classe global `.iata`) e códigos técnicos. É a assinatura visual das
  rotas.
- Escala `--text-xs` (12 px) … `--text-4xl` (60 px). Nenhum texto visível
  abaixo de 12 px.
- Preço, horário e número em coluna usam `.tabular-nums`.
- Fraunces, Public Sans e IBM Plex Mono saem do projeto.

Verificação: `eval-ui.mjs` (`texto<12` = 0); rubrica visual R2.

### DS-04 Espaço, layout e toque

- Espaço em múltiplos de 4 px (`--space-1` … `--space-24`); container
  `--container-max: 76rem`; cabeçalho `--header-height: 4rem`.
- Sem rolagem horizontal em 320, 390 e 1440 px. Grid de uma coluna usa
  `minmax(0, 1fr)`, nunca `1fr` puro (conteúdo longo empurra a coluna).
- Alvos de toque: todo alvo ≥ 24 px de altura (WCAG 2.5.8). Botões, campos e
  links com cara de botão ≥ 44 px no celular (≤ 640 px). Link dentro de frase é
  exceção.

Verificação: `eval-ui.mjs` (`overflow` = 0, `alvo<24` = 0, catraca
`ctrl<44`).

### DS-05 Raio e sombra

- Raio: 6 px controles pequenos, 10 px botões e campos, 16 px cartões, pílula
  para selos.
- Sombra por camada: `--shadow-sm` para superfície elevada discreta (cartão de
  formulário, alternador ativo); `--shadow-md` para hover de cartão clicável e
  menu aberto; `--shadow-lg` para o que flutua sobre outra camada (modal, cartão
  de busca sobre o hero, ilustração do hero). Cartão de lista parado não tem
  sombra.
- Sem gradiente decorativo. Exceções com função: o brilho `--color-route-glow`
  nos fundos petróleo (hero da busca, painel das telas de conta), a área sob a
  linha do gráfico de preço e o brilho do skeleton.

Verificação: rubrica visual R4.

### DS-06 Ícones

- Um conjunto só, em `components/ui/icon.tsx` (SVG próprio, traço uniforme,
  `aria-hidden`). Ícone novo entra lá, não como SVG solto na página.
- Ícone nunca é o único portador de significado: botão só com ícone tem
  `aria-label` (ex.: `IconButton` de inverter origem e destino).

### DS-07 Preço e tempo na tela

- Dinheiro sempre por `formatMoney({ amountMinor, currency })`; nunca `number`
  com casas decimais nem `toFixed`.
- Ausência de oferta mostra "—" ou estado vazio, nunca `R$ 0,00`.
- Todo preço mostra a idade (`Freshness`, CP-04).
- Instante (observação, verificação, horário de voo) é formatado em
  `DISPLAY_TIME_ZONE = 'America/Sao_Paulo'`, exportado por
  `lib/domain/freshness.ts`. Formatar sem fuso fixo gera texto diferente no
  servidor (UTC) e no navegador (Brasil) e quebra a hidratação do React (erro
  #418). Data de viagem (calendário) continua com `timeZone: 'UTC'`.
- Horário de voo mostra o rótulo "horários de Brasília" enquanto P-05 não for
  decidida.

Verificação: teste unitário em `lib/domain/freshness.test.ts`;
`eval-ui.mjs` roda o navegador em `America/Sao_Paulo` (`console` = 0).

## MO — Movimento

### MO-01 Princípios

- Curto, com desaceleração (`--easing-out`), **uma vez só**, e sempre com
  significado: a rota se desenha, o preço cai, o selo aparece.
- Em loop só: o ponto "ao vivo" de uma oferta dentro da validade, o spinner de
  carregamento e o brilho do skeleton.
- Durações por token: `--duration-fast` 140 ms, `--duration-base` 220 ms,
  `--duration-slow` 480 ms, `--duration-draw` 1400 ms.
- No hover só mudam cor, borda e sombra, mais duas setas pequenas: a do botão de
  compra e o chevron do cartão de monitoramento. Botão pressionado desce 1 px.

### MO-02 Keyframes globais referenciados por token

- `@keyframes fw-reveal | fw-fade-in | fw-draw | fw-pop | fw-live | fw-spin`
  ficam em `styles/globals.css`.
- `tokens.css` expõe os nomes: `--keyframes-reveal: fw-reveal;` etc.
- Em qualquer `*.module.css`, animação é `var(--keyframes-*)` **ou** um
  `@keyframes` declarado no próprio módulo. Nunca o nome global escrito direto:
  o CSS Modules (Turbopack/lightningcss) renomeia o nome dentro do módulo, o
  `@keyframes` global não é encontrado e a animação simplesmente não roda, sem
  erro no console. `:global()` não resolve esse caso.

Verificação: `check-css-modules.mjs` (`animacaoSemKeyframes` = 0) e
`eval-ui.mjs` (`anim-quebrada` = 0, lido do navegador).

### MO-03 Catálogo

| Onde                 | O que acontece                                                    | Duração        |
| -------------------- | ----------------------------------------------------------------- | -------------- |
| Logo do cabeçalho    | a rota decola, a lente aparece, o ponto pousa no destino          | 1,4 s, 1 vez   |
| Blocos de página     | `.reveal`: sobe 12 px e aparece; `--reveal-delay` escalona 2 ou 3 | 480 ms         |
| Hero da home         | avião percorre o arco, o gráfico desenha, o selo aparece          | ≈ 2 s, 1 vez   |
| `RouteLine` animada  | o arco se revela da origem ao destino, o destino dá um `pop`      | 900 ms         |
| Gráfico de histórico | a linha desenha, os pontos aparecem, o último fica laranja        | 1,4 s          |
| Selo de promoção     | `pop` curto ao entrar                                             | 420 ms         |
| Botão de compra      | seta desliza no hover; no clique vira "Abrindo o parceiro…"       | 140 ms / 2,2 s |
| Modal                | fundo desfocado, painel sobe                                      | 220 ms         |
| Oferta válida        | ponto verde pulsando (`fw-live`)                                  | loop           |

`.reveal` vai em blocos de página, nunca em cada cartão de uma lista.

### MO-04 Movimento reduzido

- `@media (prefers-reduced-motion: reduce)` zera durações e atrasos e limita
  iterações a 1. Todo elemento animado termina no estado final visível (nada
  fica com `opacity: 0` esperando uma animação que não acontece).

Verificação: `eval-ui.mjs` (`anim-c/reduce` = 0) e screenshot com
`reducedMotion: 'reduce'` igual ao estado final.

## BR — Marca

### BR-01 Arquivos oficiais

Em `apps/web/public/brand/`, copiados da referência (`ref/redesign`), textos em
curvas:

`symbol.svg`, `symbol-light.svg`, `symbol-mono-dark.svg`,
`symbol-mono-light.svg`, `logo-horizontal.svg`,
`logo-horizontal-negative.svg`, `logo-horizontal-mono.svg`,
`logo-stacked.svg`, `wordmark.svg`, `avatar-social.svg`, `avatar-1080.png`,
`app-icon.svg`, `app-icon-192.png`, `app-icon-512.png`, `og-image.png`.

Mais `app/icon.svg` (favicon) e `app/apple-icon.png`. Regras de uso em
`docs/BRAND.md` (respiro, tamanho mínimo, o que não fazer).

### BR-02 Símbolo no código

- `BrandSymbol` (CP-01) desenha a mesma geometria de `symbol.svg`: arco
  `M12 47 C14 17 43 11 52 45` dividido na folga da lente, lente em
  (25,33; 23,09) raio 6,8, traço 3,4, pontos raio 4,4, conjunto deslocado 2,5
  para baixo. Destino sempre laranja.
- O nome "Flight Watch" ao lado do símbolo é texto real (acessível), não
  imagem.

### BR-03 Metadados

- `metadataBase` a partir de `WEB_BASE_URL` (mesma variável que a API já usa em
  `apps/api/src/auth/auth.service.ts` para links de e-mail), padrão
  `http://localhost:3100`.
- Título padrão "Flight Watch — passagens observadas de perto", modelo
  `%s · Flight Watch`; descrição e Open Graph em pt-BR com
  `/brand/og-image.png` 1200 × 630.
- `themeColor` igual a `--fw-paper`.

### BR-04 Voz

Direto, calmo e verificável, sempre com a data do preço. Proibido na interface
e nos e-mails: "menor preço do mercado", "garantido", "tempo real", "melhor
momento para comprar", "imperdível", "corre que acaba", "desconto" e
"preço-alvo". Use "preço desejado", "último
preço observado", "menor preço observado pelo sistema", "N% abaixo da média
observada", "pode mudar a qualquer momento; confirme no site parceiro".
Tabela completa em `docs/BRAND.md` §"Tom de voz".

Verificação: `check-copy.mjs` (`frasesProibidas` = 0).
