# SPEC-032 — Promoções por origem, calculadas sob demanda

Status: approved para implementação (owner, 2026-10-07) — D3 segue em aberto
sem bloquear esta versão
Owner: Pricing / Discovery
Dependências: ADR-004, ADR-008, SPEC-015, SPEC-016, SPEC-020, SPEC-025,
SPEC-029, SPEC-030, SPEC-031
Fase: Travelpayouts Fase 1, fatia 4 de 4
Versão: 1.2 — substitui a 1.1 (pool fixo de origens, promoção gravada,
histórico próprio). A proposta 1.0 do owner continua como visão de longo prazo
e alimenta as SPEC-033/034.

## Objetivo

A pessoa escolhe **de onde sai** e vê as melhores promoções a partir dali,
para qualquer destino, com uma justificativa que dá para conferir:

- **por que** é promoção: quanto abaixo de qual referência;
- **com que base**: quantos preços, de quais meses;
- **quão recente** é o preço: idade pela hora em que a fonte o viu.

Promoção é **dado derivado**: nenhum provedor diz "isto é promoção"; é uma
conclusão do Flight Watch a partir de preços da fonte.

### Decisões do owner que moldam esta versão

| ID  | Decisão                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Nada é gravado no banco.** Promoção é calculada sob demanda e guardada só em cache reconstruível (Redis). A DR-019 ("Deal nunca é persistido") continua válida. |
| D2  | **Sem histórico próprio na v1.** A referência vem dos preços mais recentes da fonte (distribuição de preços da rota no mês da data e nos vizinhos).               |
| D3  | Em aberto: se a busca do usuário alimenta algum histórico. Não afeta esta versão, que não usa histórico.                                                          |
| D4  | **Sem lista fixa de origens no site.** A pessoa escolhe a origem. Origens fixas só existirão nos canais (grupos de WhatsApp, Instagram — SPEC-034).               |

## Fora do escopo

| Tema                                                                                    | Onde                                 |
| --------------------------------------------------------------------------------------- | ------------------------------------ |
| histórico próprio de preços, tendência no tempo, "menor preço já visto"                 | SPEC-033 (se D3 decidir guardar)     |
| pool de origens, coleta antecipada, polling adaptativo, orçamento por prioridade        | SPEC-033                             |
| canais (WhatsApp, Instagram), promoção gravada para "já publiquei?", origens dos grupos | SPEC-034                             |
| gráfico de preço por data (evolução visual do calendário da SPEC-031)                   | spec própria, pequena                |
| Premium, early access, limiares por plano                                               | após a spec de planos/assinatura     |
| detecção de origem por IP/geolocalização                                                | fora (privacidade; a pessoa escolhe) |

## Atores e autorização

- **Visitante** (público, sem login): escolhe a origem e lê o feed.
  Endpoint público com o rate limit `default` (SPEC-025).
- Nenhuma escrita é exposta por HTTP.

## Fluxo

```text
GET /v1/promotions?origin=CGR
  │
  ├─ cache da origem fresco? ──sim──► responde
  │
  ├─ 1 chamada: mais barato por destino a partir da origem   (candidatos)
  ├─ filtra: válidos, ≤ 72 h, destino pesquisável no catálogo
  ├─ ordena por preço, pega os N primeiros
  ├─ para cada candidato: preços da rota no mês da data e nos
  │  meses vizinhos (consulta mensal da SPEC-031, cache por rota-mês)
  ├─ avalia (função pura): referência, desconto, suspeita, score
  └─ guarda o resultado no cache da origem e responde
```

### Provedor (porta ADR-004, nova capacidade opcional)

```ts
interface FlightProvider {
  // ...search, priceCalendar, allFlightsUrl (SPEC-030/031)
  cheapestByDestination?(query: CheapestByDestinationQuery): Promise<DestinationFare[]>;
}
interface CheapestByDestinationQuery {
  originIata: string; // código de cidade (SPEC-029)
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  currency: string;
  market: string;
}
interface DestinationFare {
  destinationIata: string;
  departureDate: string; // AAAA-MM-DD
  returnDate: string | null;
  amountMinor: number;
  stops: number;
  observedAt: string; // hora em que a fonte viu (SPEC-030), nunca no futuro
}
```

- **Travelpayouts:** `v2/prices/latest` só com `origin` (verificado em
  2026-10-07: SAO devolveu 338 destinos distintos e CGR 21 numa chamada, um
  preço por destino). Mesmas regras de normalização da SPEC-030: `observedAt`
  = `found_at` limitado a agora; moeda e mercado pedidos.
- **Simulado:** lista determinística para desenvolvimento e testes, coerente
  com o `priceCalendar` simulado (a mesma rota/data dá o mesmo preço).
- Provedor sem a capacidade → feed vazio, sem erro.

### Referência

- Para cada candidato, a referência é a **mediana** dos preços da mesma rota
  e tipo de viagem no **mês da data** e nos **meses vizinhos** (anterior, se
  não for passado, e seguinte), **excluindo a própria data**. Em ida e volta,
  só entram datas com a mesma duração (regra da SPEC-031).
- Mínimo de `PROMOTION_MIN_REFERENCE_POINTS` (padrão 8) preços; abaixo disso o
  candidato fica fora (`INSUFFICIENT_DATA`).
- Preços com mais de 72 h ficam fora da referência e do candidato (SPEC-030).
- Mediana com quantidade par: média dos dois do meio, arredondada para baixo
  em unidade mínima.
- O que a referência mede, e é isso que a tela diz: **"mais barato que as
  outras datas próximas nesta rota"**. Não é "mais barato que o normal da
  rota" (isso exige histórico, SPEC-033). Limitação conhecida: se a companhia
  baixar o período inteiro, a mediana cai junto e a promoção não aparece.

### Qualificação

| Regra                         |  Valor inicial | Variável                                   |
| ----------------------------- | -------------: | ------------------------------------------ |
| desconto mínimo nacional      | 1500 bps (15%) | `PROMOTION_MIN_DOMESTIC_DISCOUNT_BPS`      |
| desconto mínimo internacional | 2000 bps (20%) | `PROMOTION_MIN_INTERNATIONAL_DISCOUNT_BPS` |
| suspeito acima de             | 7000 bps (70%) | `PROMOTION_SUSPECT_DISCOUNT_BPS`           |

- Dinheiro em `amountMinor` inteiro + moeda; moedas diferentes nunca se
  comparam (CLAUDE.md §8.1).
- `discountBps = floor((referência − preço) × 10000 / referência)`;
  `absoluteSavingMinor = referência − preço`. Nenhum float decide limiar.
- **Nacional** = origem e destino com o mesmo `countryCode` no catálogo
  (SPEC-029).
- Inválido (fora do feed, não entra em referência): preço ≤ 0, moeda diferente
  da pedida, data de viagem no passado, mais de 72 h.
- **Suspeito** (desconto acima do limite): **nunca** aparece no feed; só
  métrica e log. Consultar a mesma fonte de novo devolve o mesmo cache e não
  confirma nada.
- Uma promoção por destino (a fonte já devolve a melhor data de cada um).

Resultado da avaliação (função pura em `packages/domain`, relógio injetado):

```ts
type PromotionEvaluation =
  | { result: 'QUALIFIES'; promotion: PromotionView }
  | { result: 'SUSPECT'; discountBps: number }
  | { result: 'NOT_PROMOTIONAL'; discountBps: number }
  | { result: 'INSUFFICIENT_DATA'; referencePoints: number }
  | { result: 'INVALID_PRICE'; reason: 'NON_POSITIVE' | 'CURRENCY' | 'PAST_DATE' | 'TOO_OLD' };
```

### Score (v1, só para ordenar)

`score` inteiro de 0 a 100; `scoreVersion = 1` na resposta.

| Componente | Peso | Cálculo                                                                                |
| ---------- | ---: | -------------------------------------------------------------------------------------- |
| desconto   |   50 | linear de 0 (no limiar) a 100 (em 5000 bps), satura acima                              |
| economia   |   20 | linear até `PROMOTION_SAVING_SCORE_CAP_MINOR` (padrão 100000 = R$ 1.000), satura acima |
| frescor    |   30 | 100 com idade 0, −100/72 por hora de idade, mínimo 0                                   |

Popularidade e percentil histórico não entram na v1 (não há dado; não se
inventa valor neutro).

### Frescor (substitui o ciclo de vida da 1.1)

Sem estados gravados. A idade é sempre calculada a partir de `observedAt`:

- até 24 h: exibida normalmente, com "preço encontrado há N h";
- de 24 h a 72 h: exibida com aviso "pode ter mudado";
- acima de 72 h: fora do feed.

## Cache e custo (regra de ouro: não chamar se já sabemos)

| Cache (Redis, reconstruível)                                        | Chave                                                                                          | TTL (variável, padrão)                   |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------- |
| resultado do feed por origem                                        | `promotions:v1:{origin}:{tripType}:{currency}:{market}`                                        | `PROMOTION_FEED_CACHE_TTL_MINUTES` (360) |
| preços da rota por mês (compartilhado com o calendário da SPEC-031) | `price-calendar:v1:{origin}:{destination}:{month}:{tripType}:{tripLength}:{currency}:{market}` | `PRICE_CALENDAR_CACHE_TTL_MINUTES` (360) |

- Custo de uma origem fria: 1 + até `PROMOTION_CANDIDATES_PER_ORIGIN` (padrão 10) × 3 meses = até 31 chamadas; origem quente: 0. O custo cresce com o
  número de **origens diferentes** pedidas, não com o número de pessoas.
- Requisições simultâneas para a mesma origem fria no mesmo processo
  compartilham o mesmo cálculo (single-flight). Entre réplicas pode haver um
  cálculo duplicado; aceito na v1 e medido.
- Orçamento: `PROMOTION_DAILY_CALL_BUDGET` chamadas por dia UTC, contado no
  Redis. Esgotado: só serve cache; origem sem cache responde
  `status: "BUDGET_EXHAUSTED"` com lista vazia (a tela explica). Busca e
  monitoramento de usuário não entram nesse orçamento e nunca esperam por ele.
- Redis fora: o feed é calculado sem cache, respeitando o orçamento local do
  processo; nunca derruba a API.
- O calendário da SPEC-031 passa a usar o mesmo cache por rota-mês (hoje
  consulta a fonte a cada abertura) — mesmo dado, uma chamada a menos.

## Contrato da API

`GET /v1/promotions?origin&tripType=ONE_WAY|ROUND_TRIP&scope=all|domestic|international&sort=score|price|discount&limit`

- `origin` obrigatório, normalizado para cidade (SPEC-029); código
  desconhecido → `400 UNSUPPORTED_SEARCH` (o mesmo código da busca e do
  calendário).
- `tripType` padrão `ONE_WAY`; `limit` padrão 20, máximo 50; moeda BRL e
  mercado BR fixos na v1.
- Erro da fonte sem cache → `502 PROVIDER_UNAVAILABLE` (a tela some com o
  bloco, como no calendário).

```ts
{
  origin: string;
  originName: string;
  status: 'OK' | 'BUDGET_EXHAUSTED';
  generatedAt: string; // quando o feed desta origem foi calculado
  promotions: Array<{
    destination: string;
    destinationName: string;
    destinationCoordinates: { latitude: number; longitude: number } | null;
    scope: 'DOMESTIC' | 'INTERNATIONAL';
    tripType: 'ONE_WAY' | 'ROUND_TRIP';
    departureDate: string;
    returnDate: string | null;
    price: { amountMinor: number; currency: string };
    stops: number;
    discountBps: number;
    absoluteSavingMinor: number;
    reference: {
      amountMinor: number;
      pointCount: number;
      months: string[]; // ['2026-10','2026-11','2026-12']
      explanation: string; // texto pronto em pt-BR
    };
    observedAt: string; // idade do preço
    score: number;
    scoreVersion: 1;
    purchaseUrl: string | null; // allowlist (SPEC-018) + afiliado, superfície OPPORTUNITY (SPEC-020)
  }>;
}
```

Texto de `explanation` (exemplo): "R$ 590 está 31% abaixo da mediana de 24
preços encontrados para Campo Grande → Salvador entre outubro e dezembro."

## Web

- `/opportunities` ganha seletor de origem (o `PlaceCombobox` existente). A
  escolha fica num cookie de preferência (`fw_origin`, sem dado pessoal, 1
  ano) e na URL (`?origin=CGR`), para o link ser compartilhável.
- Sem origem escolhida: estado vazio que pede a cidade — nunca uma origem
  inventada.
- Cartão: destino, preço, "↓ 31% abaixo das datas próximas" (nunca "% OFF"),
  referência em reais, idade do preço, data(s), escalas e "Como calculamos?"
  com a `explanation`. Botão de compra pelo `PurchaseButton` + `PurchaseNote`.
- Mapa (SPEC-016) mostra os destinos do feed a partir da origem.
- Estados distintos: carregando, sem origem, sem promoção agora (não é erro),
  orçamento esgotado, fonte indisponível.
- Linguagem: "menor preço observado pelo sistema", nunca "do mercado" ou
  "garantido" (CLAUDE.md §2.3).
- `/v1/opportunities` e o `Deal` da SPEC-015 continuam no ar até esta spec
  estar verificada; removê-los é uma mudança separada.

## Persistência e migração

Nenhuma. Tudo em cache reconstruível.

## Falhas e retries

- Erro na chamada de candidatos: sem cache → 502; com cache vencido há menos
  de 72 h de idade de preço → serve o cache antigo com `generatedAt` real.
- Erro na consulta mensal de um candidato: esse candidato sai do feed desta
  rodada; os outros seguem.
- 429 da fonte: respeita `Retry-After` (sem novas chamadas do feed até lá),
  serve cache.
- Sem retry imediato dentro da requisição (H08). Timeout por chamada já
  existente no adaptador.
- Kill switch `PROMOTION_ENGINE_ENABLED=false`: o endpoint responde lista
  vazia sem chamar a fonte; a tela some com o bloco.

## Segurança e privacidade

Sem dado pessoal; a origem é preferência de navegação, não identifica
ninguém. Links só pela allowlist. Endpoint público com rate limit. Nenhum
payload bruto da fonte em log.

## Observabilidade

| Métrica                           | Labels                                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `promotion_feed_requests_total`   | `cache` (`hit`, `miss`, `stale`), `result` (`ok`, `budget_exhausted`, `provider_unavailable`, `disabled`) |
| `promotion_provider_calls_total`  | `kind` (`candidates`, `month`), `result` (`ok`, `error`, `rate_limited`, `cache_hit`)                     |
| `promotion_evaluations_total`     | `result` (`qualifies`, `suspect`, `not_promotional`, `insufficient_data`, `invalid_price`)                |
| `promotion_budget_remaining`      | — (gauge)                                                                                                 |
| `promotion_feed_duration_seconds` | `cache` (histograma)                                                                                      |

Origem **não** vira label (cardinalidade). Logs: `promotion_suspect_detected`
(rota, desconto), `promotion_budget_exhausted`, `promotion_feed_computed`
(origem, candidatos, qualificadas, chamadas, duração).

## Variáveis de ambiente (novas, api, `packages/config` e `.env.example`)

`PROMOTION_ENGINE_ENABLED` (false), `PROMOTION_CANDIDATES_PER_ORIGIN` (10),
`PROMOTION_MIN_REFERENCE_POINTS` (8), `PROMOTION_MIN_DOMESTIC_DISCOUNT_BPS`
(1500), `PROMOTION_MIN_INTERNATIONAL_DISCOUNT_BPS` (2000),
`PROMOTION_SUSPECT_DISCOUNT_BPS` (7000), `PROMOTION_SAVING_SCORE_CAP_MINOR`
(100000), `PROMOTION_FEED_CACHE_TTL_MINUTES` (360),
`PRICE_CALENDAR_CACHE_TTL_MINUTES` (360), `PROMOTION_DAILY_CALL_BUDGET`
(2000). A API passa a usar `REDIS_URL` (hoje só scheduler e workers usam).

## Critérios de aceitação

- **AC-1** Travelpayouts `cheapestByDestination`: um preço por destino, regras
  de normalização da SPEC-030, preço com mais de 72 h fora. Simulado coerente
  com o calendário simulado.
- **AC-2** Referência = mediana do mês da data e vizinhos, sem a própria data,
  mesma duração em ida e volta; abaixo do mínimo → `INSUFFICIENT_DATA`.
- **AC-3** Desconto e economia em inteiros; limiar nacional/internacional pelo
  `countryCode`; 1499 bps nacional não qualifica, 1500 qualifica.
- **AC-4** Desconto acima do limite de suspeita nunca aparece no feed.
- **AC-5** Score de 0 a 100 conforme a tabela; ordenação por score, preço ou
  desconto.
- **AC-6** Cache por origem e por rota-mês: segunda requisição da mesma origem
  dentro do TTL faz 0 chamadas; requisições simultâneas da mesma origem fria
  no mesmo processo fazem um cálculo só; o calendário da SPEC-031 reaproveita
  o cache por rota-mês.
- **AC-7** Orçamento esgotado: só cache; origem sem cache → `BUDGET_EXHAUSTED`;
  busca e monitoramento não são afetados.
- **AC-8** `GET /v1/promotions` valida e normaliza a origem, devolve
  referência, pontos, meses, explicação e idade em toda promoção; link pela
  allowlist com afiliado; erro da fonte sem cache → 502.
- **AC-9** Web: seletor de origem lembrado em cookie e na URL; estados
  distintos; base da comparação e idade em todo cartão; mapa com os destinos.
- **AC-10** Kill switch desliga o feed sem chamar a fonte.
- **AC-11** Execução real: com `FLIGHT_PROVIDER=travelpayouts`, o feed de SAO
  e de CGR mostra promoções reais com explicação conferível à mão contra o
  calendário da rota.

## Testes e evals

- Unitários de domínio: mediana (par/ímpar), bps nas bordas, nacional ×
  internacional, inválidos, suspeita, score, frescor, com relógio injetado.
- Adaptadores: Travelpayouts com fixture sanitizada do `v2/prices/latest` só
  com origem; simulado.
- API (e2e): cache hit/miss com chamadas contadas, single-flight, orçamento,
  kill switch, 400/502, link com afiliado.
- Web: lógica de apresentação (texto da referência, frescor, estados) em
  `lib/domain`.
- **EVAL-PROMO-001** — conjunto rotulado em `docs/evals/EVALS-032-promotions.md`
  com ≥ 50 casos (candidato + preços de referência + rótulo "é/não é
  promoção" do owner): precisão ≥ 90%. O conjunto é montado pelo owner a
  partir de casos reais; sem ele, o eval não conta.
- **EVAL-PROMO-002** — anomalia (≥ 7000 bps) nunca no feed: 100%.
- **EVAL-PROMO-003** — abaixo do mínimo de referência, nenhuma afirmação
  estatística: 100%.
- **EVAL-PROMO-004** — toda promoção do feed tem referência, pontos, meses,
  explicação e idade: 100%.
- **EVAL-PROMO-005** — origem quente: 0 chamadas; duas requisições
  simultâneas de origem fria: 1 cálculo.
- **EVAL-PROMO-006** — orçamento esgotado: 0 chamadas do feed; busca e Watch
  inalterados.

## Fatias de implementação

1. **Domínio**: `evaluatePromotion`, mediana, score, frescor, nacional ×
   internacional — puros, com testes (AC-2 a AC-5).
2. **Provedor**: `cheapestByDestination` na porta, Travelpayouts e simulado
   (AC-1).
3. **Config + cache**: variáveis em `packages/config`, Redis na API, cache por
   rota-mês aplicado também ao calendário da SPEC-031 (AC-6 parcial).
4. **API**: `PromotionsService` (fluxo, single-flight, orçamento, kill switch,
   métricas), contrato em `packages/contracts`, `GET /v1/promotions` (AC-6 a
   AC-8, AC-10).
5. **Web**: seletor de origem, cookie/URL, cartões, mapa, estados (AC-9).
6. **Verificação real** (AC-11) e evidência nesta spec.

## Rollout, rollback e kill switch

1. Motor desligado por padrão; liga em desenvolvimento e confere AC-11.
2. `/opportunities` passa a usar `/v1/promotions`.
3. Rollback: `PROMOTION_ENGINE_ENABLED=false` e o web volta ao
   `/v1/opportunities` (mantido até a remoção do `Deal`). Sem migração, nada
   a desfazer no banco.

## Perguntas abertas

- D3 (histórico próprio) — decide o escopo da SPEC-033.
- Limites de uso da conta Travelpayouts (define `PROMOTION_DAILY_CALL_BUDGET`
  real).
- `PROMOTION_CANDIDATES_PER_ORIGIN = 10` vs. mostrar mais destinos: medir
  quantos candidatos qualificam por origem na verificação real.

## Evidência de implementação

Pendente.
