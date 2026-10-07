# SPEC-032 — Detecção de promoções, ciclo de vida e feed

Status: draft — aguarda as decisões D1 a D4 do owner
Owner: Pricing / Discovery
Dependências: ADR-004, ADR-008, SPEC-015 (substituída em parte, ver D1),
SPEC-020, SPEC-029, SPEC-030, SPEC-031
Fase: Travelpayouts Fase 1, fatia 4 de 4
Versão: 1.1 (revisão da proposta 1.0 do owner, recortada para a primeira entrega)

## Objetivo

O Flight Watch passa a descobrir sozinho, sem depender de usuário monitorando,
preços que valem ser mostrados como promoção, com uma justificativa que a
pessoa consegue conferir:

- **por que** é promoção: quanto abaixo de qual referência;
- **com que base**: de onde veio a referência e com quantos pontos;
- **quão recente** é o preço: idade pela hora em que a fonte o viu;
- **até quando** vale: ciclo de vida controlado pelo Flight Watch.

Promoção é **dado derivado**: nenhum provedor diz "isto é promoção"; é uma
conclusão do Flight Watch a partir de preços observados.

```text
Provider → PriceObservation → validação → referência → desconto
        → limiar? → anomalia? → Promotion (ciclo de vida) → feed
```

## Fora do escopo (vai para as specs seguintes)

| Tema                                                                                     | Onde                             |
| ---------------------------------------------------------------------------------------- | -------------------------------- |
| pool dinâmico de rotas, prioridade de monitoramento, polling adaptativo (hot/warm/cold)  | SPEC-033                         |
| popularidade e percentil histórico no score                                              | SPEC-033                         |
| distribuição por canal (Instagram, WhatsApp), política de canal, eventos `Promotion*.v1` | SPEC-034                         |
| Premium, early access, limiares por plano                                                | após a spec de planos/assinatura |
| segundo provedor para confirmar anomalia                                                 | quando existir segundo provedor  |
| feature flags (o projeto não tem; exigiria ADR) — a v1 usa só kill switch por variável   | —                                |
| ML, previsão de preço, melhor momento de compra                                          | fora do MVP (CLAUDE.md §2.2)     |

A proposta 1.0 completa (visão do motor de oportunidades) fica como norte em
`docs/roadmap/` e alimenta as SPEC-033/034.

## Decisões do owner (pendentes)

| ID  | Decisão                                                           | Recomendação (usada no texto abaixo)                                                                                                                                                      |
| --- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `Promotion` é gravada no banco?                                   | **Sim.** Estados como STALE/EXPIRED/SUSPECT exigem memória. Isso substitui a DR-019 ("Deal nunca é persistido") e a classificação da SPEC-015 → registrar em **ADR-009** antes do código. |
| D2  | Como contar histórico próprio                                     | **Pontos de preço**: cada execução com sucesso conta, inclusive a "sem mudança" da SPEC-030 (que não gera observação nova). Sem isso, rota estável nunca junta 10 pontos.                 |
| D3  | A busca de descoberta do usuário (SPEC-014) alimenta o histórico? | **Não na v1.** `FlightSearch` é separado de `SearchTarget`/`PriceObservation` por decisão da SPEC-014; atravessar essa fronteira pede spec própria (candidata na SPEC-033).               |
| D4  | Cidades de origem iniciais                                        | `SAO, RIO, BSB, BHZ, POA, CWB, SSA, REC, FOR` (+ `CGR`?). Códigos de **cidade**, não aeroporto: SPEC-029 normaliza GRU/CGH/VCP → SAO e a fonte trabalha por cidade.                       |

## Atores e autorização

- **Motor de promoções** (processo interno, no scheduler): coleta, avalia e
  mantém o ciclo de vida. Sem usuário.
- **Visitante** (público, sem login): lê o feed. Leitura pública com o rate
  limit `default` (SPEC-025).
- Nenhuma ação de escrita é exposta por HTTP nesta spec.

## Universo de rotas (mínimo da v1)

1. **Origens**: lista configurável `PROMOTION_ORIGIN_CITIES` (D4), validada
   contra o catálogo (SPEC-029): código desconhecido ou não pesquisável impede
   o startup do scheduler (`config_invalid`).
2. **Destinos**: uma vez por dia, por origem, o endpoint de destinos populares
   da Travelpayouts (`city-directions` ou equivalente) devolve os destinos;
   ficam os `PROMOTION_DESTINATIONS_PER_ORIGIN` primeiros que existem no
   catálogo como pesquisáveis. Viés conhecido: popularidade de **busca** da
   base deles (não de venda, com peso do público russo) — por isso só
   descobre rotas, nunca entra no score.
3. **Meses**: o mês corrente e os `PROMOTION_MONTHS_AHEAD` seguintes.
4. **Unidade de coleta**: `(origem, destino, tipoViagem, duração, mês)` — uma
   chamada mensal (a mesma do calendário, SPEC-031) traz o preço de cada dia.
   Na v1: só ida (`ONE_WAY`) e ida e volta com `PROMOTION_ROUND_TRIP_LENGTH_DAYS`
   (padrão 7). Classe econômica, 1 adulto, moeda BRL, mercado BR.
5. **Frequência fixa** na v1: cada unidade é coletada no máximo uma vez a cada
   `PROMOTION_REFRESH_INTERVAL_HOURS` (padrão 24). Prioridade e polling
   adaptativo são da SPEC-033.

### Regra de ouro (cache-first)

Antes de chamar a fonte, o motor verifica, nesta ordem, e **não chama** se
algum responder:

1. a unidade foi coletada há menos de `PROMOTION_REFRESH_INTERVAL_HOURS`;
2. existe coleta da mesma unidade em andamento (lease, P12);
3. o orçamento do dia acabou.

Monitoramento de usuário (`Watch`/`SearchTarget`) e busca de usuário **não**
consomem o orçamento de promoções e nunca esperam por ele.

### Orçamento

`PROMOTION_DAILY_SEARCH_BUDGET` chamadas por dia (dia UTC). Esgotado: o motor
para de coletar até o dia seguinte, registra métrica e log
(`promotion_budget_exhausted`), e as promoções existentes seguem o ciclo de
vida normalmente (podem ficar STALE/EXPIRED).

## Referência de preço

### Fontes

| `referenceSource`             | O que mede                               | Mínimo para valer                                                                                                                   | Texto na tela                                                  |
| ----------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `FLIGHTWATCH_HISTORY`         | o normal **da rota no tempo**            | ≥ `PROMOTION_MIN_HISTORY_POINTS` (10) pontos (D2) em ≥ `PROMOTION_MIN_HISTORY_DAYS` (7) dias distintos de coleta, janela de 60 dias | "X% abaixo da referência da rota (N preços em D dias)"         |
| `PROVIDER_MONTH_DISTRIBUTION` | o normal **entre as datas do mesmo mês** | ≥ `PROMOTION_MIN_MONTH_DAYS` (8) **outras** datas com preço na mesma coleta                                                         | "X% abaixo da mediana das outras datas de novembro nesta rota" |

- Preferência: `FLIGHTWATCH_HISTORY` quando atinge o mínimo; senão
  `PROVIDER_MONTH_DISTRIBUTION`; senão `INSUFFICIENT_DATA` (nada é publicado).
- A distribuição do mês **exclui a própria data** avaliada da mediana.
- As duas fontes medem coisas diferentes e por isso têm textos diferentes. A
  tela nunca diz "abaixo do normal" quando a base é só o mês.
- Histórico/média/preço típico vindos do provedor (`PROVIDER_HISTORY` da
  proposta 1.0): a Travelpayouts Data API não fornece; fica reservado no enum
  para um provedor futuro que forneça, sem implementação na v1.

### Cálculo

- Referência = **mediana**, nunca média e nunca o mínimo sozinho. Quantidade
  par de valores: média dos dois do meio, arredondada para baixo em unidade
  mínima.
- Dinheiro em `amountMinor` inteiro + moeda (CLAUDE.md §8.1). Moedas
  diferentes nunca se comparam: ponto em outra moeda fica fora da referência.
- `discountBps = floor((referência − atual) × 10000 / referência)` — inteiro em
  pontos-base; nenhum float decide limiar.
- `absoluteSavingMinor = referência − atual`.
- **Contexto**: só entram na referência preços da mesma
  `(origem, destino, tipoViagem, duração, moeda, mercado)`. A fragmentação por
  antecedência/período (proposta 1.0 §66) fica para quando houver volume.
- O selo "menor preço já observado" (SPEC-015 `HISTORICAL_LOW`) passa a ser
  **complemento** de uma promoção já qualificada com `FLIGHTWATCH_HISTORY`, nunca
  critério sozinho.

## Qualificação

| Regra                         |  Valor inicial | Variável                                   |
| ----------------------------- | -------------: | ------------------------------------------ |
| desconto mínimo nacional      | 1500 bps (15%) | `PROMOTION_MIN_DOMESTIC_DISCOUNT_BPS`      |
| desconto mínimo internacional | 2000 bps (20%) | `PROMOTION_MIN_INTERNATIONAL_DISCOUNT_BPS` |
| suspeito acima de             | 7000 bps (70%) | `PROMOTION_SUSPECT_DISCOUNT_BPS`           |

- **Nacional** = origem e destino com o mesmo `countryCode` no catálogo
  (SPEC-029).
- Rejeitado antes de qualquer cálculo (`INVALID_PRICE`, não entra na
  referência): preço ≤ 0, moeda diferente da pedida, data de viagem no
  passado, rota diferente da pedida, preço com mais de 72 h (regra da
  SPEC-030).
- Resultado da avaliação (função pura no domínio, sem estado):

```ts
type PromotionEvaluation =
  | {
      result: 'QUALIFIES';
      reference: Reference;
      discountBps: number;
      absoluteSavingMinor: number;
      score: number;
    }
  | { result: 'SUSPECT'; reference: Reference; discountBps: number }
  | { result: 'NOT_PROMOTIONAL'; reference: Reference; discountBps: number }
  | { result: 'INSUFFICIENT_DATA' }
  | { result: 'INVALID_PRICE'; reason: InvalidPriceReason };
```

## Agrupamento e identidade

Uma promoção representa a **melhor data** de uma unidade. Chave única:

```text
(origem, destino, tipoViagem, duração, mês de viagem, moeda, mercado)
```

- Se novembro inteiro de SAO → LIS qualificar, o feed mostra **uma** promoção
  (a data mais barata), com "outras datas no calendário" — nunca 30 cartões.
- Coleta nova cuja melhor data (a mesma ou outra) ainda qualifica **atualiza**
  a promoção ativa: preço, data, referência, score e `lastConfirmedAt`; o
  estado volta a `ACTIVE` se estava `STALE`. Só vira `ENDED` quando a melhor
  data da coleta nova não qualifica.
- Avaliar de novo a mesma coleta não cria nem altera nada (idempotência por
  `(chave, observedAt da melhor data, preço)`), mesmo com entrega
  at-least-once (H05).
- Duas avaliações concorrentes da mesma chave: uma vence pelo lease da
  unidade; a outra encerra sem efeito.

## Ciclo de vida

```text
          QUALIFIES                      nova coleta não qualifica
 (nada) ───────────► ACTIVE ─────────────────────────────────► ENDED
   │                  │  ▲                                          ▲
   │ SUSPECT          │  │ nova coleta confirma                     │
   ▼                  ▼  │                                          │
 SUSPECT          STALE ─┘  (idade > STALE)   ── idade > EXPIRED ──► EXPIRED
   │ próxima coleta: ainda suspeito ou some → REJECTED
   │ próxima coleta: preço plausível que qualifica → ACTIVE (preço novo)
```

| Estado     | Público?                                                  | Significado                                                                 |
| ---------- | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| `ACTIVE`   | sim                                                       | qualificada; preço visto pela fonte há ≤ `PROMOTION_STALE_AFTER_HOURS` (24) |
| `STALE`    | sim, com aviso "preço encontrado há N h, pode ter mudado" | idade entre 24 h e `PROMOTION_EXPIRE_AFTER_HOURS` (72)                      |
| `ENDED`    | não                                                       | coleta mais nova mostrou preço que não qualifica — muda **na hora**         |
| `EXPIRED`  | não                                                       | sem confirmação até 72 h de idade                                           |
| `SUSPECT`  | **nunca**                                                 | desconto acima do limite de suspeita                                        |
| `REJECTED` | não                                                       | suspeita não confirmada; o preço sai da referência histórica                |

- **Idade conta a partir de `observedAt`** — a hora em que a fonte viu o
  preço (SPEC-030), não a hora da nossa consulta. Na Travelpayouts um preço
  pode chegar com horas de idade; os limites de 24/72 h refletem isso (a
  proposta 1.0 sugeria 6/24 h, que fariam quase toda promoção nascer velha).
- **SUSPECT nunca é publicado automaticamente.** Consultar a mesma fonte de
  novo devolve o mesmo cache e não confirma nada; sem segundo provedor, a
  única confirmação é uma coleta seguinte com preço plausível.
- Estados terminais (`ENDED`, `EXPIRED`, `REJECTED`) não voltam; uma nova
  qualificação da mesma chave cria um novo registro.
- A validade de 72 h da fonte é da fonte; a validade comercial é a desta
  máquina de estados.

## Score (v1)

`score` de 0 a 100, só para ordenar o feed. Versão registrada em cada
promoção (`scoreVersion = 1`) para comparar mudanças futuras.

| Componente | Peso | Cálculo                                                                                                 |
| ---------- | ---: | ------------------------------------------------------------------------------------------------------- |
| desconto   |   50 | linear de 0 (no limiar) a 100 (em 5000 bps)                                                             |
| economia   |   20 | linear até o teto `PROMOTION_SAVING_SCORE_CAP_MINOR` (padrão 100000 = R$ 1.000), satura acima           |
| confiança  |   30 | `FLIGHTWATCH_HISTORY` 100 / `PROVIDER_MONTH_DISTRIBUTION` 60, menos 1 ponto por hora de idade, mínimo 0 |

Popularidade e percentil histórico ficam para a SPEC-033, quando houver dado
real; até lá não entram com valor neutro inventado.

## Contrato da API

`GET /v1/promotions?origin&destination&scope=domestic|international&sort=score|price|discount|recent&limit`

- público, rate limit `default`; filtros normalizados para cidade (SPEC-029);
- devolve só `ACTIVE` e `STALE`, ordenado por `score` por padrão;
- resposta:

```ts
{
  promotions: Array<{
    id: string;
    origin: string;
    originName: string;
    destination: string;
    destinationName: string;
    scope: 'DOMESTIC' | 'INTERNATIONAL';
    tripType: 'ONE_WAY' | 'ROUND_TRIP';
    departureDate: string;
    returnDate: string | null; // AAAA-MM-DD
    price: { amountMinor: number; currency: string };
    discountBps: number;
    absoluteSavingMinor: number;
    reference: {
      amountMinor: number;
      source: 'FLIGHTWATCH_HISTORY' | 'PROVIDER_MONTH_DISTRIBUTION';
      pointCount: number;
      periodDays: number;
      explanation: string; // texto pronto em pt-BR
    };
    historicalLow: boolean;
    status: 'ACTIVE' | 'STALE';
    observedAt: string; // RFC3339 UTC — idade do preço
    score: number;
    purchaseUrl: string | null; // allowlist (SPEC-018) + afiliado (SPEC-020, superfície PROMOTION)
  }>;
  total: number;
}
```

- `/v1/opportunities` e o `Deal` da SPEC-015 continuam funcionando até esta
  spec estar verificada; a remoção é uma mudança separada, registrada no
  ADR-009 (D1).

## Web

- `/opportunities` (feed e mapa) passa a ler `/v1/promotions`.
- Cartão: rota, preço, "↓ 31% abaixo da referência" (nunca "% OFF"),
  referência em reais, idade do preço, data(s) e "Como calculamos?" com o
  `explanation`.
- `STALE` aparece com o aviso de idade; estado vazio diz que não há promoção
  agora (não é erro).
- Linguagem: "menor preço observado pelo sistema", nunca "do mercado" ou
  "garantido" (CLAUDE.md §2.3).

## Persistência e migração

Migração expansiva (sem tocar tabelas existentes):

- `promotion_routes` — `(origin, destination)` descobertas, `discoveredAt`,
  `lastSeenAt`, `active`;
- `promotion_collections` — uma linha por coleta de unidade: chave da
  unidade, `collectedAt`, resultado (`SUCCEEDED`/`NO_OFFERS`/falha tipada),
  lease; os preços por data da coleta (pontos de referência, D2) em tabela
  filha `promotion_price_points` imutável;
- `promotions` — chave de agrupamento, estado, preço e data representativos,
  referência (valor, fonte, pontos, período), `discountBps`,
  `absoluteSavingMinor`, `score`, `scoreVersion`, `observedAt`,
  `lastConfirmedAt`, `stateChangedAt`; índice único parcial em
  `(chave) WHERE status IN ('ACTIVE','STALE','SUSPECT')`.

Pontos de preço do motor ficam em tabelas próprias, não em
`PriceObservation`: não há `Watch`/`SearchTarget` por trás e o fan-out de
alertas não deve vê-los. Unificar com o histórico de `SearchTarget` é decisão
da SPEC-033.

## Falhas e retries

- Erro da fonte: classificação de erro existente (`ProviderError`); temporário
  → coleta marcada como falha e reagendada pelo próximo tick, sem retry
  imediato (H08); 429 respeita `Retry-After` e para o motor até lá.
- Falha não mexe em promoção existente: ela segue o ciclo por idade.
- Kill switch `PROMOTION_ENGINE_ENABLED=false`: não coleta nem avalia; o feed
  devolve vazio. `PROMOTION_DISCOVERY_ENABLED=false`: não descobre destinos
  novos, mantém as rotas já conhecidas.

## Segurança e privacidade

Sem dado pessoal. Links de compra só pela allowlist. Endpoint público com rate
limit. Nenhum payload bruto da fonte em log.

## Observabilidade

| Métrica                       | Labels                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| `promotion_collections_total` | `result` (`succeeded`, `no_offers`, `failed`, `skipped_fresh`, `skipped_budget`)                     |
| `promotion_evaluations_total` | `result` (`qualifies`, `suspect`, `not_promotional`, `insufficient_data`, `invalid_price`), `source` |
| `promotion_transitions_total` | `from`, `to`                                                                                         |
| `promotions_current`          | `status` (gauge)                                                                                     |
| `promotion_budget_remaining`  | — (gauge)                                                                                            |
| `promotion_feed_fetch_total`  | `result`                                                                                             |

Taxas (cache hit, cliques por promoção, custo por promoção) são calculadas no
Prometheus a partir dessas séries e de `purchase_clicks`; não viram métrica
própria. Log `promotion_budget_exhausted` e `promotion_suspect_detected`
com a chave da unidade.

## Variáveis de ambiente (novas, `packages/config`, scheduler e api)

`PROMOTION_ENGINE_ENABLED` (false), `PROMOTION_DISCOVERY_ENABLED` (false),
`PROMOTION_ORIGIN_CITIES`, `PROMOTION_DESTINATIONS_PER_ORIGIN` (15),
`PROMOTION_MONTHS_AHEAD` (2), `PROMOTION_ROUND_TRIP_LENGTH_DAYS` (7),
`PROMOTION_REFRESH_INTERVAL_HOURS` (24), `PROMOTION_DAILY_SEARCH_BUDGET`,
`PROMOTION_MIN_HISTORY_POINTS` (10), `PROMOTION_MIN_HISTORY_DAYS` (7),
`PROMOTION_MIN_MONTH_DAYS` (8), `PROMOTION_MIN_DOMESTIC_DISCOUNT_BPS` (1500),
`PROMOTION_MIN_INTERNATIONAL_DISCOUNT_BPS` (2000),
`PROMOTION_SUSPECT_DISCOUNT_BPS` (7000), `PROMOTION_STALE_AFTER_HOURS` (24),
`PROMOTION_EXPIRE_AFTER_HOURS` (72), `PROMOTION_SAVING_SCORE_CAP_MINOR`
(100000). Todas em `.env.example`. Motor desligado por padrão.

Custo de referência (10 origens × 15 destinos × 3 meses × 2 tipos de viagem):
900 unidades/dia com refresh de 24 h → orçamento inicial sugerido de 1000
chamadas/dia, a confirmar contra os limites da conta Travelpayouts.

## Critérios de aceitação

- **AC-1** Referência é a mediana, de `FLIGHTWATCH_HISTORY` quando atinge o
  mínimo, senão `PROVIDER_MONTH_DISTRIBUTION` excluindo a própria data, senão
  `INSUFFICIENT_DATA`.
- **AC-2** Desconto e economia em inteiros (bps e unidade mínima); limiar
  nacional/internacional pelo `countryCode`; 1499 bps nacional não qualifica,
  1500 qualifica.
- **AC-3** Preço inválido é rejeitado e não entra em nenhuma referência.
- **AC-4** Desconto acima do limite de suspeita vira `SUSPECT`, nunca aparece
  no feed; confirmado só por coleta seguinte plausível; senão `REJECTED`.
- **AC-5** Uma promoção por chave de agrupamento; reavaliar a mesma coleta não
  muda nada.
- **AC-6** Ciclo de vida por idade a partir de `observedAt`: `ACTIVE` →
  `STALE` (24 h) → `EXPIRED` (72 h); coleta que não qualifica → `ENDED`
  imediato; terminais não voltam.
- **AC-7** Cache-first: unidade fresca, em andamento ou sem orçamento não gera
  chamada; orçamento esgotado não afeta Watch nem busca de usuário.
- **AC-8** `GET /v1/promotions` devolve só `ACTIVE`/`STALE`, com referência,
  fonte, pontos, período, explicação e idade; link pela allowlist com
  afiliado.
- **AC-9** O feed web mostra a base da comparação e a idade de toda promoção,
  com textos distintos por fonte de referência.
- **AC-10** Kill switches desligam motor e descoberta separadamente.
- **AC-11** Execução real: com o motor ligado para 2 origens, o feed mostra
  promoções reais da Travelpayouts com explicação conferível à mão.

## Testes e evals

- Unitários de domínio: mediana (par/ímpar), bps nas bordas, escolha da fonte,
  validação, score, máquina de estados (todas as transições e as proibidas).
- Integração (Postgres real): unicidade da chave, idempotência da reavaliação,
  lease concorrente, orçamento.
- e2e da API: filtros, ordenação, só estados públicos, link com afiliado.
- **EVAL-PROMO-001** — conjunto rotulado em `docs/evals/` com ≥ 50 casos
  (preço, pontos de referência, rótulo "é/não é promoção" dado pelo owner):
  precisão ≥ 90%. Sem o conjunto rotulado o eval não conta.
- **EVAL-PROMO-002** — anomalia (≥ 7000 bps) nunca publicada: 100%.
- **EVAL-PROMO-003** — sem referência mínima, nunca afirmação estatística: 100%.
- **EVAL-PROMO-004** — toda promoção no feed tem referência, fonte e
  explicação: 100%.
- **EVAL-PROMO-005** — nenhuma chamada para unidade fresca ou em andamento:
  0 chamadas duplicadas no cenário de dois ticks concorrentes.
- **EVAL-PROMO-006** — orçamento esgotado: 0 chamadas do motor e Watch/busca
  de usuário sem impacto: 100%.

## Rollout, rollback e kill switch

1. Migração expansiva; motor desligado por padrão.
2. Liga a descoberta e o motor para 2 origens em desenvolvimento; confere o
   feed (AC-11) e o consumo real de chamadas.
3. Liga as demais origens; ajusta orçamento.
4. Troca o `/opportunities` para `/v1/promotions`.

Rollback: kill switch; o web volta ao `/v1/opportunities` (mantido até a
remoção do `Deal`). As tabelas novas não afetam as existentes.

## Perguntas abertas

- D1 a D4 acima.
- Limites de uso da conta Travelpayouts para `city-directions` e para a
  consulta mensal (define o orçamento real).
- A proposta 1.0 citava 6 h/24 h para STALE/EXPIRED; a revisão usa 24 h/72 h
  pela idade da fonte — confirmar.

## Evidência de implementação

Pendente.
