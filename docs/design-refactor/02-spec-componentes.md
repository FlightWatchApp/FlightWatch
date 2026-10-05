# 02 — Spec dos componentes

Cada componente tem ID, local, contrato (props), comportamento e critérios em
Dado/Quando/Então. Os caminhos são relativos a `apps/web/src/`. "Referência"
aponta o arquivo em `ref/redesign` (ver `00-contexto.md`).

Regras que valem para todos: DS-01 a DS-07, MO-01 a MO-04 e BR-04 de
`01-spec-design-system.md`. Componente não chama a API por conta própria, não
recalcula regra de domínio e não formata dinheiro fora de `formatMoney`.

## Marca

### CP-01 `BrandSymbol`

- Local: `components/brand/brand-symbol.tsx` (+ `.module.css`). Substitui
  `components/ui/brand-mark.tsx`, que sai.
- Props: `size?: number` (padrão 32), `animated?: boolean`,
  `variant?: 'tile' | 'plain'`, `className?`.
- `tile`: bloco petróleo raio 16/64 com traço branco; `plain`: só o traço em
  `currentColor`.
- Geometria de BR-02. Decorativo (`aria-hidden`).
- Dado `animated`, quando monta, então a rota desenha (`--keyframes-draw`), a
  lente aparece e o destino dá `pop`, em 1,4 s, uma vez. Com movimento reduzido
  aparece pronto.

### CP-02 `Logo`

- Local: `components/brand/logo.tsx`. Props: `size?: 'sm' | 'md'`,
  `animated?`, `inverse?` (texto branco sobre petróleo).
- Símbolo + "Flight Watch" em texto real, Instrument Sans 600.
- Dado o cabeçalho, quando a página carrega pela primeira vez, então o logo
  anima (CP-01). Navegações seguintes não reanimam de forma perceptível.

### CP-03 `RouteLine`

- Local: `components/brand/route-line.tsx`. Props: `origin`, `destination`
  (IATA), `size?: 'sm' | 'md' | 'lg'`, `showCities?`, `animated?`.
- Estrutura: IATA de origem (mono) → arco tracejado com ponto de origem neutro e
  ponto de destino laranja → IATA de destino. Com `showCities`, a cidade
  aparece embaixo do código quando o aeroporto é conhecido.
- Cidade e rótulo de aeroporto vêm de funções puras em
  `lib/domain/airport-coordinates.ts` (a tabela de SPEC-016):
  `airportCity('GRU') === 'São Paulo/Guarulhos'` e
  `airportLabel('GRU') === 'GRU · São Paulo/Guarulhos'`, com teste. Na
  referência essa lógica está duplicada em `route-line.tsx`,
  `search-form.tsx` e `new-watch-form.tsx`; aqui ela nasce num lugar só.
- Acessível como "GRU para MIA" (texto oculto " para " entre os códigos); arco
  decorativo.
- Dado `animated`, então o arco se revela da origem ao destino em 900 ms e o
  destino dá `pop`.
- Dado 320 px e uma cidade longa ("Nova York/JFK"), então a cidade quebra linha
  e nada vaza do cartão (DS-04).
- Toda rota na interface usa este componente (cartões, cabeçalhos, detalhe).

## Preço e compra

### CP-04 `Freshness`

- Local: `components/ui/freshness.tsx`. Props: `observedAt` (ISO),
  `expiresAt?: string | null`, `prefix?` (padrão "Observado").
- Relógio compartilhado por `useSyncExternalStore`: um único intervalo de 30 s
  para todas as instâncias. `getServerSnapshot` devolve `null`.
- Dado o primeiro render (servidor e hidratação), então mostra a data absoluta
  "Observado em 30/09/2026, 12:44" formatada em `DISPLAY_TIME_ZONE` (DS-07).
- Dado o cliente hidratado, então mostra "Observado há 5 minutos · válido por
  mais 2 horas", com `<time dateTime>` e o absoluto no `title`.
- Dado `expiresAt` no futuro, então há um ponto verde pulsando (`fw-live`,
  `aria-hidden`). Dado `expiresAt` no passado, então o texto vira "… · preço
  expirado, confirme no parceiro", em âmbar, sem ponto.
- Não usa `useEffect` + `setState` para o relógio (a regra
  `react-hooks/set-state-in-effect` do lint reprova).

### CP-05 `PurchaseButton`

- Local: `components/purchase/purchase-button.tsx`. Substitui
  `components/watches/purchase-link-button.tsx` e os `<a>` de compra soltos em
  `opportunity-card.tsx` e `offer-card.tsx`.
- Props: `href` (já validado pela API e com afiliado), `status: 'CURRENT' |
'EXPIRED'`, `size?`, `fullWidth?`, `watchId?`, `context?`.
- Sempre um `<a>` real, `target="_blank"`,
  `rel="noopener noreferrer sponsored"`, estilo de botão.
- Rótulo: "Comprar passagem" (primário) quando `CURRENT`; "Atualizar preço"
  (secundário) quando `EXPIRED`. Preço vencido nunca aparece como comprável.
- Texto oculto para leitor de tela: ", GRU para MIA por R$ 1.083,91 (abre o
  site parceiro em nova aba)".
- Dado clique, então o rótulo vira spinner + "Abrindo o parceiro…" por 2,2 s,
  sem bloquear a navegação. Dado `watchId`, então registra o clique
  (`recordPurchaseClickAction`, SPEC-018) em best-effort.
- Dado hover, então só a seta ↗ desliza 2 px.
- Único lugar do web que renderiza link de compra.

Verificação: `check-purchase.mjs` (`compraSemSponsored` = 0,
`blankSemNoopener` = 0).

### CP-06 `PurchaseNote`

- Local: `components/purchase/purchase-note.tsx`. Prop: `align?: 'start' |
'center'`.
- Texto fixo: "Você finaliza a compra no site parceiro. Podemos receber
  comissão, sem custo extra para você. Saiba mais" com link para
  `/transparencia`.
- Aparece ao lado de todo bloco com `PurchaseButton`. Numa lista de cartões,
  uma vez abaixo da lista (cartões em modo `compact` não repetem).

Verificação: `check-purchase.mjs` (`paginaSemAvisoComissao` = 0).

## Promoções e monitoramentos

### CP-07 `DealBadge`

- Local: `components/deals/deal-badge.tsx` (sai de `app/opportunities/`).
- `HISTORICAL_LOW`: selo verde cheio com ícone de brilho, "Menor preço já
  visto". `PERCENTAGE_BELOW_REFERENCE`: selo verde suave com seta para baixo,
  "Abaixo da média". Rótulos em `lib/domain/deal.ts`.
- Entra com `pop` (420 ms). O selo nunca aparece sem `deal.explanation` por
  perto.

### CP-08 `DealCard`

- Local: `components/deals/deal-card.tsx`. Substitui
  `app/opportunities/opportunity-card.tsx`. Props: `opportunity`,
  `selected?` (destaque vindo do mapa, SPEC-016), `compact?`.
- Conteúdo obrigatório, nesta ordem: `DealBadge` + `Freshness`; `RouteLine`
  com cidades; datas ("Só ida · 24 de out. de 2026" ou "ida → volta"),
  duração e conexões ("Direto" / "1 conexão"); "Preço observado" com o valor;
  economia "R$ X abaixo da média" quando `PERCENTAGE_BELOW_REFERENCE`, senão
  "1 adulto · econômica"; `deal.explanation` + "Base: N preços observados pelo
  sistema."; ações.
- Ações: `PurchaseButton` (ou "Link de compra indisponível para esta oferta"
  quando `purchaseUrl` é `null`) e "Monitorar preço" (secundário), lado a lado
  quando cabem, empilhadas quando não.
- "Monitorar preço" abre `Modal` "Monitorar este preço" com campo "Preço
  desejado" (dica: "Avisamos quando o preço observado atingir esse valor ou
  menos."). Confirmar chama `monitorOpportunityAction` e leva a
  `/watches/:id`. Abrir o card nunca cria Watch sozinho.
- `aria-label` do `article`: "Promoção GRU para MIA, R$ 1.083,91".
- Sem `compact`, mostra `PurchaseNote` embaixo.

### CP-09 `WatchCard`

- Local: `components/watches/watch-card.tsx`.
- Topo: `RouteLine` como link para o detalhe (chevron que desliza no hover,
  texto oculto "Ver detalhes e histórico") + `StatusTag`.
- Datas da viagem; "Último preço observado" (ou "—") e "Preço desejado".
- Destaques: "Preço desejado atingido" (verde cheio) e "Menor preço já
  observado" (verde suave), só quando verdadeiros.
- Linha de verificação: "Verificado há 2 horas" ou "Aguardando a primeira
  verificação"; em âmbar com ícone de alerta quando o dado está velho (48 h,
  `isStale`) e o monitoramento está ativo.
- Ações: `PurchaseButton` `sm` com `watchId` quando há oferta e o
  monitoramento está ativo; `WatchLifecycleActions` (Pausar/Retomar/Encerrar).
- Monitoramento inativo fica esmaecido, sem botão de compra.

### CP-10 `PriceHistoryChart`

- Local: `components/watches/price-history-chart.tsx`. Props: `points`,
  `targetAmountMinor`. SVG próprio (sem biblioteca, AGENTS.md §2).
- Ordena os pontos cronologicamente (a API devolve do mais novo para o mais
  antigo).
- Eixo Y sem centavos ("R$ 1.450"), rótulos à esquerda com halo; o eixo não
  começa em zero e o subtítulo da seção diz isso. Linha do preço desejado
  tracejada com rótulo à direita. Área sob a linha em degradê.
- Pontos: último em laranja (r 6), menor em verde (r 5), demais neutros.
  Cada ponto tem `<title>` com **uma única string**
  (``{`${data}: ${preço}`}``): vários filhos em `<title>` quebram a
  hidratação.
- Legenda e tabela completa em `<details>` ("Ver histórico em tabela (N)"),
  com `role="region"` e sem `tabIndex`.
- Linha desenha com `pathLength=1` + `var(--keyframes-draw)`; pontos aparecem
  depois.
- Em ≤ 640 px os rótulos continuam legíveis (≥ 12 px efetivos); a media query
  fica no fim do arquivo para vencer a regra base.
- Sem observação: estado vazio, nunca linha em zero (H04).

### CP-16 `OfferCard`

- Local: `app/search/[id]/offer-card.tsx`.
- Horários de partida e chegada formatados em `DISPLAY_TIME_ZONE`, com o
  rótulo "horários de Brasília"; trilho com um ponto por conexão;
  companhia e cabine.
- Caixa de compra: preço, `Freshness` com prefixo "Preço visto",
  `PurchaseButton`, "Monitorar preço" (modal igual ao do CP-08, rótulo "Preço
  desejado").
- A oferta mais barata da busca ganha a marca "Mais barata desta busca" (nunca
  "do mercado").

## Estrutura

### CP-11 `SiteHeader` + `MainNav`

- Locais: `components/layout/site-header.tsx`, `components/layout/main-nav.tsx`.
- Esquerda: `Logo` animado (link para `/`). Itens públicos: Promoções, Buscar
  passagens. Com sessão, mais "Meus monitoramentos". Direita: Entrar e "Criar
  conta grátis" (visitante), ou "Criar monitoramento", e-mail e Sair (sessão).
- Item atual com `aria-current="page"` e sublinhado laranja que cresce da
  esquerda.
- Abaixo de 860 px: botão de menu (44 × 44, `aria-expanded`, `aria-controls`)
  abre um painel. Esc fecha, trocar de rota fecha, foco volta ao botão.
- Cabeçalho fixo no topo com fundo petróleo (`--color-brand-strong`) e borda
  inferior; `Logo` em modo `inverse`, sublinhado do item atual em
  `--fw-route-300` (variante de laranja pra fundo escuro), CTA preenchido
  claro (mesmo padrão de `.bandCta` da home) — nunca `--color-action` cheio
  aqui, que ficaria quase invisível sobre o próprio fundo petróleo. Painel
  do menu mobile (abaixo de 860px) herda o mesmo fundo escuro.

### CP-12 `SiteFooter`

- `Logo` pequeno + "Passagens observadas de perto."; links Promoções, Buscar
  passagens, Como ganhamos dinheiro (`/transparencia`).
- Aviso fixo: "O Flight Watch observa preços e leva você ao site parceiro para
  comprar. Não vendemos nem emitimos passagens. Alguns links são de afiliados:
  podemos receber uma comissão do parceiro, sem custo extra para você. Preços
  observados podem mudar até a compra."

### CP-13 `AuthShell`

- Local: `components/account/auth-shell.tsx`. Props: `title`, `subtitle`,
  `children`, `footer?`.
- ≥ 960 px: painel da marca à esquerda (petróleo profundo, brilho do destino,
  `BrandSymbol` animado, "Passagens observadas de perto." e três benefícios que
  o produto já cumpre) e formulário à direita. Abaixo disso, só o formulário.
- Link do rodapé ("Criar conta", "Entrar") com alvo ≥ 24 px.

### CP-14 `HeroIllustration`

- Local: `components/home/hero-illustration.tsx`. Ilustração, não dado real:
  rotulada "Exemplo". Série fixa 1.480 → 1.212 (queda de 18%).
- Em ≈ 2 s: rota desenha, avião percorre o arco, linha de preço desenha, o
  último ponto vira promoção com selo e botão de compra de mentira (não
  clicável, `aria-hidden`).

### CP-15 Base de UI

- `Button`: `primary | secondary | ghost | destructive`, `sm | md | lg`,
  `loading` (spinner + `aria-busy`), `fullWidth`, ícones. `sm` tem 40 px no
  desktop e 44 px até 640 px.
- `IconButton`: sempre com `aria-label`; 44 × 44.
- `Modal`: `<dialog>` nativo com `showModal()` (o navegador prende o foco,
  fecha com Esc e devolve o foco); fundo `--color-overlay` com desfoque, painel
  sobe 8 px em 220 ms; clique fora fecha.
- `InlineAlert`, `StatusTag`, `Skeleton`, `EmptyState`, `FormField`,
  `TextInput`, `Select`: só migração para os tokens novos; comportamento igual
  ao de `fa57198`.
