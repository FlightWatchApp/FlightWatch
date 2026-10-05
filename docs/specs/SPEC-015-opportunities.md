# SPEC-015 — Promoções e feed de oportunidades

Status: draft para aprovação
Owner: Monitoring
Dependências: SPEC-001, SPEC-004, SPEC-005, SPEC-014, SPEC-018,
`docs/roadmap/rascunhos/SPEC-015-opportunities.md`,
`docs/roadmap/04-domain-and-platform-evolution.md`

## Objetivo

Dar a quem **ainda não tem nenhum Watch** um motivo pra abrir o produto: um
feed público (`GET /v1/opportunities`) que classifica, entre as rotas que
**já estão sendo monitoradas por alguém**, quais têm um preço fora do padrão
agora — menor preço já visto para a rota, ou significativamente abaixo da
média histórica. Cada item do feed é explicado (nunca "promoção" sem
justificativa) e pode virar um Watch com um clique.

## Fora do escopo

- **`dealType: FLASH_WINDOW`** (queda recente, janela de tempo curta):
  precisa de dois limiares de produto não aprovados — "quão recente" e
  "quão grande" — e é uma alegação de confiança direta ao usuário; errar
  esse limiar é o tipo de risco que esta spec existe pra evitar (categoria
  diferente de um placeholder interno como um timeout, onde um valor errado
  é invisível ao usuário). Adiado até o produto decidir os valores;
- **`dealType: PACKAGE_VALUE`**: depende de SPEC-017 (pacotes de viagem),
  que está fora de escopo — não existe fonte autorizada de hospedagem;
- **`dealType: TARGET_PRICE`** como classificação editorial: existe como
  `AlertRule.TARGET_PRICE` (por usuário, SPEC-001), mas um limiar universal
  pro feed público não tem base de produto aprovada;
- **crawler de fundo / descoberta de rotas populares**: o feed só enxerga
  `SearchTarget`s que **já existem** porque alguém criou um Watch — ver
  "Comportamento de domínio" para o raciocínio completo. Não é uma limitação
  temporária, é uma decisão de escopo: variar rotas "populares" sem
  monitoramento real seria inventar dado;
- **paginação de servidor**: o feed devolve tudo que sobreviveu ao scan
  limitado (`OPPORTUNITIES_SCAN_LIMIT_DEFAULT`) numa resposta só — mantém o
  estado de seleção mapa↔lista do SPEC-016 trivial (mesmo array, mesmos
  índices);
- **persistência de `Deal`**: nunca existe como linha de banco — ver
  "Comportamento de domínio";
- **endpoint novo para "monitorar"**: reusa `POST /v1/watches` (SPEC-001)
  tal qual — ver "Comportamento de domínio".

## Atores e autorização

Público, sem autenticação — `GET /v1/opportunities` não usa
`SessionAuthGuard`, mesmo tratamento de `GET /v1/searches/flights/:id`
(SPEC-014). "Monitorar" uma oportunidade exige login (redireciona pra
`/login` se anônimo), mas o próprio ato de criar o Watch é o
`POST /v1/watches` já existente de SPEC-001 — nenhuma autorização nova.

## Entradas e validação

```
GET /v1/opportunities?origin=DOU&destination=GRU&maxPriceMinor=80000&dealType=HISTORICAL_LOW&sort=best_value
```

Todos os parâmetros são opcionais. Validação Zod
(`packages/contracts/src/opportunities/list-opportunities.ts`,
`listOpportunitiesQuerySchema`):

- `origin`/`destination`: IATA de 3 letras (`iataCodeSchema`, compartilhado
  com SPEC-001/014 via `packages/contracts/src/shared/trip-fields.ts`);
- `departureDateFrom`/`departureDateTo`: data ISO;
- `maxPriceMinor`: inteiro positivo;
- `maxStops`: inteiro 0-3;
- `dealType`: `HISTORICAL_LOW` ou `PERCENTAGE_BELOW_REFERENCE`;
- `sort`: `best_value` (default) | `lowest_price` | `most_recent` |
  `shortest_duration`.

Falha de validação → `400 INVALID_OPPORTUNITIES_QUERY`.

## Comportamento de domínio e invariantes

### `Deal` nunca é persistido

Classificação computada a cada leitura, exatamente como
`Watch.currentOffer`/`currentPrice`/`lowestPrice` já são
(`enrichWatch`, `packages/database/src/watch-listing-repository.ts`). Sem
tabela nova, sem invalidação de cache — cada `PriceObservation` nova que o
scheduler grava já "atualiza" o feed automaticamente, de graça. Ver
`DOMAIN.md` §3.11.

### O feed só existe onde já há monitoramento real

`findOrCreateSearchTarget` (que cria um `SearchTarget`) só é chamado de um
único lugar em todo o código: `WatchesService.doCreateWatch`. SPEC-014
(busca de descoberta) deliberadamente não toca `SearchTarget` — busca
pontual e monitoramento recorrente são conceitos separados por design
(`docs/roadmap/04-domain-and-platform-evolution.md`). Isso
significa: `GET /v1/opportunities` é alimentado por rotas que **alguém já
monitora** — não existe (e não deveria existir agora) um crawler de fundo
varrendo rotas populares. Um ambiente sem nenhum Watch real tem o feed
sempre vazio; isso é esperado, não um bug, e é mostrado como estado vazio
explicado (`EmptyState`), nunca como erro.

### Scan em duas etapas, não N+1 por candidato

1. `listCandidateSearchTargetsForOpportunities`: `SearchTarget`s
   `status: ACTIVE` com `departureDate >= agora`, limitados a
   `OPPORTUNITIES_SCAN_LIMIT_DEFAULT = 200` (teto de engenharia, não
   requisito de produto — mesmo espírito de `PRICE_HISTORY_LIMIT`).
2. `summarizeObservationStats`: **uma única** `priceObservation.groupBy`
   (count + min + avg) sobre os ids já limitados do passo 1 — não uma
   agregação por candidato. Alvos com menos de
   `MIN_OBSERVATIONS_FOR_REFERENCE = 2` observações são excluídos aqui.
3. Para cada candidato sobrevivente, uma consulta pra pegar a observação
   mais recente (`deeplink`/`expiresAt`/`providerStrategy` — dados que o
   `groupBy` não carrega). Esse passo continua sendo N consultas, uma por
   candidato, bounded pelo limite do passo 1 — mesmo custo aceito hoje em
   `listWatchesForUser`/`enrichWatch` ("aceitável na escala atual, otimizar
   só quando importar de verdade"). Documentado, não otimizado
   preventivamente; candidato a EVAL futuro se o volume real justificar
   (mesmo precedente de EVAL-PERF-002).

### Classificação (`packages/domain/src/deal/deal-classification.ts`)

- `HISTORICAL_LOW`: preço mais recente é `<=` o menor preço já visto pra
  este `SearchTarget` (sem corte por Watch — "menor já visto", ponto).
  Checado primeiro: é a classificação mais forte, nunca reportada junto com
  `PERCENTAGE_BELOW_REFERENCE`.
- `PERCENTAGE_BELOW_REFERENCE`: preço mais recente pelo menos
  `MIN_PERCENTAGE_BELOW_REFERENCE = 10`% abaixo da média histórica —
  reusa `evaluatePercentageDropRule` (SPEC-005) tal qual, mesma matemática
  de cruzamento inteiro.
- Sem essas duas condições: `dealType: null`, o `SearchTarget` não vira
  item do feed (resultado normal pra maioria das rotas, não um erro).
- `confidence` (`LOW`/`MEDIUM`/`HIGH`): heurística de tamanho de amostra —
  informativa, não afeta se algo é ou não um deal.

### "Monitorar" reusa `POST /v1/watches` existente

Diferente do SPEC-014 (`POST /v1/offers/:id/watch`, que precisa semear a
primeira observação porque o `SearchTarget` é literalmente novo), uma
oportunidade já tem um `SearchTarget` com histórico real. "Monitorar" só
chama `POST /v1/watches` (SPEC-001) com os mesmos campos que a oportunidade
já carrega; `findOrCreateSearchTarget` acha, não cria, o target por
fingerprint. Confirmado em smoke test ao vivo: nenhuma duplicata de
`SearchTarget` foi criada.

## Contrato de API/evento/job

`GET /v1/opportunities` → `200`:

```json
{
  "opportunities": [
    {
      "searchTargetId": "uuid",
      "origin": "DOU", "destination": "GRU", "tripType": "ONE_WAY",
      "market": "BR", "departureDate": "2026-12-20", "returnDate": null,
      "deal": {
        "dealType": "HISTORICAL_LOW", "referenceAmountMinor": 64472,
        "currentAmountMinor": 64472, "currency": "BRL", "dropPercent": null,
        "confidence": "LOW", "observationCount": 2,
        "explanation": "Menor preço já observado para esta rota.",
        "validFrom": "...", "validUntil": "..."
      },
      "offer": {
        "amountMinor": 64472, "currency": "BRL",
        "purchaseUrl": "https://booking.simulated-provider.flightwatch.dev/checkout/...",
        "provider": "SIMULATED", "observedAt": "...", "expiresAt": "...",
        "status": "CURRENT", "segments": [...],
        "durationMinutes": 150, "connectionsCount": 0
      }
    }
  ],
  "total": 4
}
```

Nenhum evento/job novo.

## Persistência e migrações

Nenhuma migração — só leitura de `SearchTarget`/`PriceObservation` já
existentes (SPEC-002/004).

## Idempotência e concorrência

Leitura pura, sem efeito colateral, sem questão de idempotência.
"Monitorar" reusa a idempotência já existente de `POST /v1/watches`
(SPEC-001 §9).

## Modos de falha e retries

Nenhuma chamada externa — sem modo de falha de provider. Um `SearchTarget`
sem observações suficientes simplesmente não aparece no feed (não é erro).

## Segurança e privacidade

- rota pública, sem exposição de dado sensível (rota/preço/data são os
  mesmos dados já públicos em SPEC-014);
- `purchaseUrl` passa pela mesma allowlist de host/esquema `https:` de
  SPEC-018 antes de qualquer URL chegar à resposta HTTP;
- sem rate limit — leitura local limitada, não uma chamada de saída a um
  provider (único caso que já ganhou throttler é
  `POST /v1/searches/flights`, SPEC-014); revisitar se o volume de tráfego
  justificar.

## Observabilidade

- `opportunities_feed_fetch_total{result}`;
- `deal_classification_total{type}` — mesmo nome já previsto em
  `04-domain-and-platform-evolution.md`;
- sem log de payload bruto do provider (não há chamada de provider aqui).

## Performance e orçamento de custo

Scan limitado a `OPPORTUNITIES_SCAN_LIMIT_DEFAULT = 200` `SearchTarget`s,
uma agregação em lote + N consultas de "última observação" bounded pelo
mesmo limite. Sem índice em `totalAmountMinor` (`PriceObservation` só tem
`[searchTargetId, observedAt desc]`) — aceitável na escala atual, mesmo
tratamento de perf de SPEC-009/015: documentado, não otimizado
preventivamente.

## Critérios de aceitação

- AC-001: rota com preço no menor já observado classifica `HISTORICAL_LOW`;
- AC-002: rota com preço >= 10% abaixo da média histórica (e não sendo o
  menor já visto) classifica `PERCENTAGE_BELOW_REFERENCE`;
- AC-003: rota com menos de 2 observações nunca aparece no feed;
- AC-004: `SearchTarget` `INACTIVE` ou com `departureDate` passada nunca
  aparece no feed;
- AC-005: `purchaseUrl` é `null` quando o host do deep link não passa na
  allowlist — nunca uma URL não confiável;
- AC-006: filtros (`origin`, `destination`, `maxPriceMinor`, `maxStops`,
  `dealType`) restringem o resultado corretamente;
- AC-007: `GET /v1/opportunities` funciona sem autenticação;
- AC-008: "Monitorar" uma oportunidade cria um Watch reusando o
  `SearchTarget` existente — nenhuma duplicata;
- AC-009 (frontend): abrir a página nunca cria Watch sozinho — só a
  confirmação explícita no modal;
- AC-010: query malformada → `400 INVALID_OPPORTUNITIES_QUERY`.

## Testes e evals

- unitário: `packages/domain/src/deal/deal-classification.test.ts` (11
  casos: HISTORICAL_LOW exato, prioridade sobre PERCENTAGE_BELOW_REFERENCE,
  limiar de 10% acima/abaixo/na borda, amostra insuficiente, heurística de
  confiança);
- unitário: `packages/contracts/src/opportunities/list-opportunities.test.ts`
  (7 casos);
- integração: `packages/database/src/opportunity-repository.integration.test.ts`
  (Testcontainers, 8 casos: agregação em lote correta pra múltiplos
  targets numa chamada só, exclusão por amostra insuficiente, "menor já
  visto" não afetado por ordem de inserção, filtros de candidato);
- e2e: `apps/api/src/opportunities/opportunities.e2e.spec.ts`
  (Testcontainers, 8 casos cobrindo AC-001 a AC-010).

## Rollout, rollback e kill switch

Sem migração, sem feature flag — endpoint inteiramente novo
(`GET /v1/opportunities`), nenhum cliente existente o chama. Rollback é
reverter o deploy; nenhum dado é alterado (leitura pura).

## Questões em aberto

- limiar de `MIN_PERCENTAGE_BELOW_REFERENCE = 10`% é placeholder, produto
  não decidiu o valor final — mesmo tratamento de `COOLDOWN_SECONDS_MIN/MAX`;
- sem índice em `PriceObservation.totalAmountMinor` — monitorar se o scan
  ficar lento em produção com volume real (candidato a EVAL, mesmo
  precedente de EVAL-PERF-002);
- o feed depender inteiramente de Watches reais existentes é uma decisão
  deliberada, mas significa que um ambiente novo (sem nenhum Watch) tem o
  feed sempre vazio — pode valer a pena, numa fase posterior, seedar
  algumas rotas de demonstração;
- sem paginação de servidor — revisitar se `OPPORTUNITIES_SCAN_LIMIT_DEFAULT`
  não for mais suficiente.

## Evidência de implementação

Status: implementado e verificado em 2026-09-21/22.

### Arquivos principais

- `packages/domain/src/deal/deal-classification.ts` (novo) — `classifyDeal`,
  11 testes.
- `packages/database/src/opportunity-repository.ts` (novo) —
  `listCandidateSearchTargetsForOpportunities`, `summarizeObservationStats`,
  `findLatestObservationForSearchTarget`, `findLowestEverObservation`; 8
  testes de integração.
- `packages/contracts/src/opportunities/list-opportunities.ts` (novo) — 7
  testes.
- `apps/api/src/opportunities/` (novo módulo) — controller, service, pipe;
  8 testes e2e.
- `apps/api/src/observability/metrics.service.ts` —
  `opportunitiesFeedFetchTotal`, `dealClassificationTotal`.
- `apps/web/src/app/opportunities/` (novo) — `page.tsx`,
  `opportunity-card.tsx`, `deal-badge.tsx`, `actions.ts`.
- `apps/web/src/lib/api/opportunities.ts`, `apps/web/src/lib/domain/deal.ts`.

### Comandos executados (resultado real)

- `pnpm -w typecheck` — 20/20 pacotes ok.
- `pnpm -w lint` — 13/13 pacotes ok.
- `pnpm -w test` — 20/20 tasks ok; `apps/api` 118/118 testes (110
  pré-existentes + 8 novos e2e).
- `pnpm -w build` — 13/13 tasks ok; `/opportunities` gerada como rota
  dinâmica.

### Smoke test ao vivo (processos reais já em execução, sem mocks)

1. `GET /v1/opportunities` sem token → `200`, 4 oportunidades reais
   classificadas `HISTORICAL_LOW` a partir de `SearchTarget`s acumulados de
   smoke tests anteriores desta sessão (dado real, não fixture) — incluindo
   `status: EXPIRED` corretamente mostrado para observações com mais de 1h,
   sem esconder o dado.
2. `GET :9100/metrics` confirmou `opportunities_feed_fetch_total{result="success"} 1`
   e `deal_classification_total{type="HISTORICAL_LOW"} 4`.
3. Registro de usuário real + verificação de canal via `UPDATE` direto +
   `POST /v1/watches` com os mesmos campos de uma oportunidade existente
   (DOU→GRU 2026-12-20) → confirmado por consulta direta ao Postgres que o
   número de `SearchTarget`s para essa rota/data continuou sendo 1 antes e
   depois — nenhuma duplicata criada.

Frontend: sem Playwright configurado neste ambiente (confirmado nas fatias
anteriores) — verificação por `pnpm -w build` (rota gerada corretamente) e
leitura de código; sem verificação visual manual em navegador — documentado
como gap, mesmo padrão de SPEC-014/018.
