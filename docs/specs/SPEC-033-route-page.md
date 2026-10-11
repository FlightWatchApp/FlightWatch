# SPEC-033 — Página da rota (e o mesmo modelo no monitoramento)

Status: approved (owner, 2026-10-08) — escrita por Claude, revisada pelo owner; a página vai evoluir
Owner: Discovery
Dependências: SPEC-016 (mapa), SPEC-018/020 (link de compra e afiliado),
SPEC-025 (rate limit), SPEC-029 (catálogo de lugares), SPEC-031 (calendário),
SPEC-032 (promoções e cache por rota-mês)
Referência visual: páginas de rota da FlightConnections
(`flightconnections.com/pt/voos-de-gru-para-dou`) — estrutura, não conteúdo

## Objetivo

Cada par de cidades ganha uma página própria — "Passagens de São Paulo para
Dourados" — que mostra a rota e, principalmente, **o preço**: o que a
FlightConnections não tem. Três usos:

1. **Pessoa** que clica numa promoção, num resultado de busca ou chega pelo
   Google: vê a rota no mapa, os preços por data, se está em promoção, e age
   (ver os voos no parceiro, monitorar).
2. **Monitoramento** (`/watches/[id]`): passa a usar o mesmo modelo de página,
   com o histórico do monitoramento no lugar dos preços por data.
3. **SEO**: tráfego orgânico. Páginas de rota são o que traz visitante do
   Google para buscas como "passagem São Paulo Dourados".

## Decisões do owner (2026-10-08)

| ID  | Decisão                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------- |
| D1  | A página entra só com o que temos hoje. **Companhias aéreas ficam fora** até haver fonte confiável (outras APIs). |
| D2  | **Mapa** com a rota, como na referência.                                                                          |
| D3  | **SEO entra nesta spec** (URL, metadados, sitemap): o formato da URL é difícil de mudar depois de indexado.       |

Motivo de D1, verificado em 2026-10-08: o `routes.json` da Travelpayouts
lista "JJ" (código antigo da TAM) em CGR → GRU e não tem GRU → DOU, rota que
a LATAM opera. Mostrar isso seria afirmar algo errado.

## Fora do escopo

| Tema                                                         | Onde / quando                                    |
| ------------------------------------------------------------ | ------------------------------------------------ |
| companhias aéreas, alianças, classes                         | quando houver fonte confiável (novos provedores) |
| dias da semana com voo, horários                             | idem — exige fonte de horários                   |
| página por aeroporto (GRU ≠ CGH)                             | Fase 2 (busca em tempo real filtra aeroporto)    |
| vitrine de promoções na página inicial                       | SPEC-034                                         |
| histórico de preço da rota no tempo (para quem não monitora) | depende da decisão D3 da SPEC-032                |
| texto editorial por rota (dicas de destino)                  | fora                                             |

## Atores e autorização

- **Visitante** (público): lê a página da rota. Rate limit `default`.
- **Robôs de busca**: leem página e sitemap; contam no mesmo rate limit e no
  orçamento de chamadas (ver "Custo").
- **Dono do monitoramento**: `/watches/[id]`, autorização por propriedade como
  hoje (sem mudança de regra).

## URL e canonicalização

```text
/voos/{origem}-para-{destino}
/voos/sao-paulo-sao-para-dourados-dou
```

- Cada lado é `{slug-do-nome}-{código-da-cidade}` em minúsculas. **O código
  decide**; o slug é só legibilidade (nomes repetem: "São José").
- Sempre por **cidade** (SPEC-029): `/voos/gru-para-dou` ou
  `/voos/guarulhos-gru-para-dourados-dou` → **308** para a URL canônica de
  SAO → DOU.
- Slug errado ou antigo com código certo → **308** para o slug atual.
- Código desconhecido, cidade não pesquisável ou origem = destino → **404**.
- Ida e volta são páginas diferentes (`sao-paulo-sao-para-dourados-dou` e
  `dourados-dou-para-sao-paulo-sao`), ligadas entre si.
- A canonicalização é **função pura no web** (`lib/domain/route-url.ts`):
  slug a partir do nome (sem acento, minúsculas, hífen) e parse do caminho.
- Toda página tem `<link rel="canonical">` para a URL canônica.

## Conteúdo da página

```text
Início › Voos de São Paulo › para Dourados              (breadcrumb)
Passagens de São Paulo para Dourados                    (h1)
Preços atualizados em 08/10/2026 · ver ida: Dourados → São Paulo

┌ Rota ─────────────────────┐  ┌ Mapa ─────────────────────┐
│ São Paulo (SAO) · Brasil   │  │ OpenStreetMap + Leaflet   │
│ GRU · CGH · VCP            │  │ arco origem → destino     │
│        ✈                   │  │                           │
│ Dourados (DOU) · Brasil    │  │                           │
│ DOU                        │  │                           │
└───────────────────────────┘  └───────────────────────────┘

Menor preço encontrado: R$ 489 em 12/11 · encontrado há 6 h
[selo "↓ 31% abaixo das datas próximas" se a rota estiver em promoção]
[gráfico preço por data — 3 meses, mediana tracejada, clicar abre a data]
Datas mais baratas: 12/11 R$ 489 · 19/11 R$ 512 · ...
[Ver todos os voos no site parceiro]  [Monitorar esta rota]

Sobre a rota
  Distância            875 km (calculada)
  Tempo de voo direto  cerca de 1 h 35 (estimado)
  Aeroportos           São Paulo: GRU, CGH, VCP · Dourados: DOU

Outras rotas
  Dourados → São Paulo (ida inversa)
  Outros destinos saindo de São Paulo (do cache de promoções, se houver)
```

### Regras do conteúdo

- **Todo dado diz de onde vem** (EVAL-ROUTE-001):
  - preço: menor preço encontrado pela fonte, com data e idade (SPEC-030);
  - distância: **calculada** (grande círculo) entre as coordenadas das
    cidades no catálogo (SPEC-029), em km inteiros;
  - tempo de voo: **estimado** a partir da distância (`30 min + distância ÷
800 km/h`, arredondado a 5 min), sempre com a palavra "estimado" e o
    rótulo "direto"; não afirma que existe voo direto;
  - aeroportos: os comerciais de cada cidade no catálogo.
- Sem dado confiável, a linha **não aparece** (nunca "—" para fato inventado,
  nunca companhia aérea — D1).
- **Selo de promoção** só se a rota estiver no feed de promoções **já em
  cache** da origem (SPEC-032); a página nunca dispara o cálculo do feed.
- **Gráfico**: o mesmo "preço por data" do cartão da página inicial
  (`lib/domain/price-chart.ts`), com a mediana das datas mostradas tracejada.
  Clicar ou Enter num ponto busca aquela data (busca existente, SPEC-014).
- **Monitorar esta rota**: escolhe a data (o ponto do gráfico ou a data mais
  barata) → busca → resultado, onde o monitoramento já existe.
- **Sem nenhum preço** nos meses consultados: estado "Ainda não encontramos
  preços para esta rota" com "Ver todos os voos no site parceiro" e
  "Monitorar esta rota"; nunca R$ 0 (H04). Página continua útil (mapa, fatos).
- Linguagem: "menor preço encontrado/observado pelo sistema", nunca "do
  mercado"; sem "imperdível" (check-copy).

## Monitoramento (`/watches/[id]`) no mesmo modelo

- Mesmo cabeçalho de rota, mapa e "Sobre a rota" (componentes
  compartilhados: `RouteHeader`, `RouteMap`, `RouteFacts`).
- No lugar dos "preços por data": o **histórico do monitoramento** que já
  existe (`PriceHistoryChart`), o preço desejado, as regras de alerta, o
  estado e as ações de pausar/cancelar (`WatchLifecycleActions`) — sem
  mudança de comportamento, só de layout.
- Link "Ver a página da rota" para a página pública.
- Página privada: `noindex` e fora do sitemap.

## SEO

- **Título**: "Passagens de São Paulo para Dourados | Flight Watch". Sem
  preço no título (o Google guarda o título por dias; o preço muda).
- **Descrição** (meta): "Menor preço encontrado de São Paulo para Dourados:
  R$ 489 em 12/11, visto em 08/10. Compare as datas, veja no mapa e
  monitore." Sem preço quando não houver.
- **Dados estruturados**: `BreadcrumbList` (JSON-LD). Nada de tipos de
  produto/oferta: não vendemos a passagem.
- **Indexação**:
  - com pelo menos um preço nos meses consultados → `index, follow`;
  - sem preço → `noindex, follow` (não publica página vazia no Google);
  - `/watches/*`, `/account`, `/search?*` → `noindex`.
- **Sitemap** (`/sitemap.xml`): rotas a partir das cidades de
  `ROUTE_SITEMAP_ORIGIN_CITIES` (lista do owner), destinos = os que a fonte
  devolve com preço na chamada "mais barato por destino" já em cache
  (SPEC-032), mais as rotas de monitoramentos ativos. Só URLs canônicas.
  Regenerado no máximo a cada `ROUTE_SITEMAP_TTL_MINUTES`.
- **`/robots.txt`**: aponta o sitemap; bloqueia `/watches`, `/account`,
  `/search` e `/api`.
- Links internos: cartões de promoção, resultados de busca e mapa de
  oportunidades passam a apontar para a página da rota.

## API

`GET /v1/routes/{origin}/{destination}?tripType=ONE_WAY|ROUND_TRIP`

- público, rate limit `default`; origem e destino normalizados para cidade;
  código desconhecido, não pesquisável ou igual → `404 ROUTE_NOT_FOUND`;
- devolve tudo que a página precisa numa chamada (o web não faz 3–4 chamadas
  ao rate limit por visita, achado do cartão da SPEC-032):

```ts
{
  origin: RoutePlace; destination: RoutePlace;   // código, nome, país, coordenadas, aeroportos comerciais
  distanceKm: number | null;                     // null sem coordenadas
  estimatedDirectFlightMinutes: number | null;
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  prices: {
    status: 'OK' | 'NO_PRICES' | 'UPDATING' | 'UNAVAILABLE';
    months: string[];                            // AAAA-MM consultados
    days: Array<{ date: string; amountMinor: number; stops: number; observedAt: string }>;
    cheapest: { date: string; amountMinor: number; observedAt: string } | null;
    referenceMedianMinor: number | null;         // mediana das datas mostradas
    currency: 'BRL';
  };
  promotion: { discountBps: number; departureDate: string; explanation: string } | null; // só do cache
  allFlightsUrl: string | null;                  // allowlist + afiliado (superfície ROUTE, nova)
  generatedAt: string;
}
```

- `UPDATING`: algum mês não estava em cache e o orçamento do dia acabou —
  devolve o que houver; a página diz "preços em atualização".
- `UNAVAILABLE`: fonte fora e nada em cache.
- Distância e tempo estimado: funções puras em `packages/domain`
  (`greatCircleKm`, `estimateDirectFlightMinutes`), com o arredondamento
  testado nas bordas.
- Superfície de afiliado nova `ROUTE` (`PurchaseSurface`), para medir cliques
  vindos da página.

## Custo e cache

- Preços vêm do **cache por rota-mês** da SPEC-032 (mesmo dado do calendário
  e das promoções). Mês sem cache consulta a fonte **só dentro do orçamento**
  `ROUTE_PAGE_DAILY_CALL_BUDGET` (separado do orçamento do feed).
- Motivo: robôs de busca podem abrir milhares de páginas por dia; sem
  orçamento próprio, o Google consumiria a cota da Travelpayouts. Esgotado,
  a página sai com o que estiver em cache (`UPDATING`) — nunca erro.
- Busca e monitoramento de usuário não entram nesse orçamento.
- Resposta da rota em cache curto (`ROUTE_PAGE_CACHE_TTL_MINUTES`, padrão 30)
  por `(origem, destino, tipoViagem)`.
- O mapa usa os tiles do OpenStreetMap como a SPEC-016 (atribuição
  obrigatória visível); carregado só no navegador (`dynamic`, sem SSR).

## Falhas

- Fonte fora com cache: serve cache, com a idade real.
- Fonte fora sem cache: `UNAVAILABLE`; a página mostra rota, mapa e fatos, e
  o bloco de preço diz que não foi possível consultar agora (≠ "sem preço").
- Mapa não carrega (tiles fora): a página segue; o bloco do mapa some.
- 429 da fonte: respeita `Retry-After` pelo mesmo controle da SPEC-032.

## Observabilidade

| Métrica                           | Labels                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `route_page_requests_total`       | `prices` (`ok`, `no_prices`, `updating`, `unavailable`), `cache` (`hit`, `miss`) |
| `route_page_provider_calls_total` | `result` (`ok`, `error`, `rate_limited`, `budget_exhausted`)                     |
| `route_page_budget_remaining`     | — (gauge)                                                                        |
| `route_canonical_redirects_total` | `reason` (`airport_code`, `slug`)                                                |
| `sitemap_generated_total`         | `result`                                                                         |

Rota **não** vira label (cardinalidade). Clique de afiliado medido pela
superfície `ROUTE` (SPEC-020).

## Variáveis de ambiente

`ROUTE_PAGE_ENABLED` (false), `ROUTE_PAGE_DAILY_CALL_BUDGET` (1000), `ROUTE_PAGE_CACHE_TTL_MINUTES` (30),
`ROUTE_PAGE_MONTHS` (3), `ROUTE_SITEMAP_ORIGIN_CITIES` (lista do owner),
`ROUTE_SITEMAP_TTL_MINUTES` (360) — em `packages/config` e `.env.example`.

## Critérios de aceitação

- **AC-1** URL canônica por cidade; código de aeroporto e slug errado → 308;
  inexistente/igual → 404; ida e volta ligadas.
- **AC-2** `GET /v1/routes/...` devolve lugares, distância, tempo estimado,
  preços dos meses, mais barato, mediana, promoção (só do cache) e link, numa
  chamada.
- **AC-3** Distância calculada e tempo estimado corretos nas bordas (mesmas
  coordenadas, antimeridiano, coordenada ausente → null) e sempre rotulados.
- **AC-4** Nenhuma companhia aérea, dia da semana ou classe exibidos (D1).
- **AC-5** Sem preço: estado próprio, sem R$ 0, `noindex`; fonte fora ≠ sem
  preço.
- **AC-6** Orçamento da página esgotado não chama a fonte e não afeta busca,
  monitoramento nem feed de promoções.
- **AC-7** Mapa com origem, destino, arco e atribuição do OpenStreetMap;
  falha do mapa não derruba a página.
- **AC-8** Gráfico de preço por data com mediana; clicar/Enter num ponto abre
  a busca daquela data; teclado e leitor de tela (padrão do cartão inicial).
- **AC-9** `/watches/[id]` no mesmo modelo, com histórico, regras e ações sem
  mudança de comportamento, `noindex`.
- **AC-10** SEO: título, descrição, canonical, `BreadcrumbList`,
  `/sitemap.xml` só com URLs canônicas indexáveis, `/robots.txt`.
- **AC-11** Execução real: SAO → DOU, SAO → LIS e uma rota sem preço,
  verificadas num navegador (desktop e celular).

## Testes e evals

- Domínio: `greatCircleKm`, `estimateDirectFlightMinutes`; web: slug e parse
  de URL, textos e estados (`lib/domain`).
- API (e2e): canonicalização, 404, orçamento, cache, `UPDATING` /
  `UNAVAILABLE`, promoção só do cache, link com afiliado `ROUTE`.
- Web: jornada no navegador headless (Playwright com Chromium), desktop 1326
  px e celular 390 px, como na verificação do cartão da SPEC-032.
- **EVAL-ROUTE-001** — todo fato exibido tem origem visível (calculado,
  estimado, encontrado em …): 100%.
- **EVAL-ROUTE-002** — nenhuma companhia, dia da semana ou classe na página: 100%.
- **EVAL-ROUTE-003** — GRU/CGH/VCP/slug alternativo levam à mesma URL
  canônica de SAO: 100%.
- **EVAL-ROUTE-004** — rota sem preço: sem R$ 0, `noindex`, ações
  disponíveis: 100%.
- **EVAL-ROUTE-005** — sitemap só com URLs canônicas e indexáveis: 100%.
- **EVAL-ROUTE-006** — desktop e celular: nenhum elemento fora da tela
  (medido por elemento, não só rolagem — achado da SPEC-032), sem erro no
  console: 100%.
- **EVAL-ROUTE-007** — 1000 aberturas de páginas frias com orçamento 50: no
  máximo 50 chamadas à fonte.

## Fatias de implementação

1. **Domínio e URL**: distância, tempo estimado, slug/parse (AC-1, AC-3).
2. **API**: `GET /v1/routes/...`, orçamento, cache, superfície `ROUTE`
   (AC-2, AC-5, AC-6).
3. **Web — página da rota**: cabeçalho, mapa, gráfico, fatos, estados, links
   internos (AC-4, AC-5, AC-7, AC-8).
4. **SEO**: metadados, JSON-LD, sitemap, robots (AC-10).
5. **Monitoramento no mesmo modelo** (AC-9).
6. **Verificação real no navegador** e evidência (AC-11, evals).

## Rollout e rollback

Sem migração. A página é nova; os links internos passam a apontar para ela
na fatia 3. Rollback: os links voltam aos destinos atuais e o sitemap sai do
ar (`ROUTE_PAGE_ENABLED=false` desliga a rota, o sitemap e os links). Antes
do domínio próprio, o sitemap não é enviado ao Google.

## Perguntas abertas

- `ROUTE_SITEMAP_ORIGIN_CITIES`: quais cidades (a mesma lista da vitrine da
  SPEC-034?).
- Fórmula do tempo estimado (`30 min + km ÷ 800`): validar com 5 rotas reais
  antes de publicar. Para SAO → DOU (875 km) ela dá 1 h 35; a
  FlightConnections informa 1 h 50.
- Página de rota com ida e volta como padrão em vez de só ida?

## Evidência de implementação

2026-10-08, branch `feat/route-page` (sobre `feat/hero-promotion` + `main`).
Fatias 1 a 4 feitas; **5 (monitoramento no mesmo modelo) e 6 (evidência
final) pendentes**.

**Ajustes ao texto durante a implementação:**

- **Rate limit próprio** (`pages`, `ROUTE_PAGE_RATE_LIMIT_MAX`, padrão 60 por
  IP na janela de `RATE_LIMIT_WINDOW_MS`) em vez do `default` da busca (10).
  Achado no navegador: uma visita pré-carrega links; com 5 páginas por minuto
  a API dava 429 e o site, 500. A cota da fonte continua protegida pelo
  orçamento diário e pelo cache. Links da página sem pré-carregamento.
- **Retry-After compartilhado** entre feed de promoções e página
  (`pricing-source/provider-guard.ts`): um 429 vale para o token inteiro.
  Orçamentos continuam separados (`DailyCallBudget` por consumidor).
- **Sitemap só com preço dentro da janela da página** e com idade válida, e
  **rota vista sem preço sai do sitemap por um dia** — "mais barato por
  destino" e a consulta mensal da fonte às vezes discordam.
- Ida e volta na página usa duração de 7 dias (a página não pergunta a volta).
- Erro da API na página vira tela amigável (`error.tsx`), nunca 500 cru.

**Por fatia:**

1. Domínio: `greatCircleKm`, `estimateDirectFlightMinutes` (6 testes contra
   distâncias conhecidas). Web: `slugify`, `routeSegment`, `parseRouteSegment`
   (8 testes, inclusive "Belém do Pará").
2. API `GET /v1/routes/{o}/{d}`: `findRouteCities` (2 testes de integração),
   contrato, superfície de afiliado `ROUTE`, config, métricas, kill switch;
   e2e com Postgres real (normalização, 404/400, estados, cache, orçamento,
   429 compartilhado, promoção só do cache, rate limit próprio).
3. Web `/voos/[rota]`: cidades, mapa (arco de grande círculo, OSM), preço
   por data (componente compartilhado com o cartão da SPEC-032), datas mais
   baratas, "Ver todos os voos", "Monitorar", "Sobre a rota", estados, 308
   canônico, metadados, JSON-LD. Lógica em `route-page.ts` (8 testes) e
   `route-map.ts` (3 testes).
4. `GET /v1/routes` (sitemap), `/sitemap.xml`, `/robots.txt`,
   `iataListField` (3 testes).

**Gates:** API 199/199, web 103, lint 14/14, typecheck 22/22, `check:design`.

**Execução real** (Travelpayouts, navegador headless, desktop 1326 px e
celular 390 px): SAO → DOU (852 km, 1 h 35 estimado; preços reais), SAO →
LIS (44 datas, mais barato R$ 1.423), DOU → LIS (`NO_PRICES`, `noindex`, sem
R$ 0); `gru-para-dou` e slug errado → 308; inexistente → 404; mapa com tiles,
nenhum elemento fora da tela, sem erro no console; clique numa data abre a
busca. Sitemap com SAO e CGR: todas as URLs abertas — 121 rotas, 0 não
indexáveis na segunda rodada.

**Não verificado:** página em produção com domínio real (sitemap não foi
enviado ao Google); calibragem da fórmula do tempo (SAO → DOU dá 1 h 35, a
FlightConnections diz 1 h 50).
