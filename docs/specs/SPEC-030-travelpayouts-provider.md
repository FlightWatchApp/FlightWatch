# SPEC-030 — Provedor Travelpayouts e resumo de tarifa

Status: implementada (ver "Evidência de implementação")
Owner: Pricing
Dependências: ADR-004, ADR-008, SPEC-003, SPEC-004, SPEC-014, SPEC-015, SPEC-018,
SPEC-020, SPEC-024, SPEC-029
Fase: Travelpayouts Fase 1, fatia 2 de 4

## Objetivo

Monitoramento e busca funcionando com preço real: `FLIGHT_PROVIDER=travelpayouts`
faz o price-worker e a busca consultarem a Travelpayouts Data API, e o sistema
guarda e exibe o dado como ele é — o **menor preço encontrado** para a rota e o
dia, com escalas, duração e o instante em que foi encontrado.

## Fora do escopo

- calendário de preços e botão "ver todos os voos" na tela de busca (SPEC-031);
- rotas populares e vitrine automática (SPEC-032);
- marker de afiliado real (decisão do owner: só com o site no ar);
- mais de 1 adulto: o preço do cache é por pessoa; os contratos já limitam a 1.

## Comportamento

### Resumo de tarifa no domínio (ADR-004: "campos ausentes permanecem ausentes")

`FlightOffer` passa a ter **ou** trechos (`segments`, como hoje) **ou**
`fareSummary` — nunca os dois, e o sistema nunca inventa trechos a partir do
resumo:

```ts
interface FareSummary {
  originCode: string; // cidade (SPEC-029)
  destinationCode: string;
  departureDate: string; // YYYY-MM-DD
  returnDate: string | null;
  stops: number; // escalas na ida
  durationMinutes: number | null;
}
```

- **Elegibilidade:** mesmas regras de total, moeda, passageiros e validade;
  rota e data comparadas no resumo; ida e volta exigem a mesma data de volta.
- **Seleção** (SPEC-004): menor total; empate por duração (sem duração = maior),
  escalas e assinatura. Assinatura do resumo:
  `FARE|origem|destino|ida|volta|escalas|duração`.
- **Formato gravado** (`PriceObservation.itinerary`, `FlightSearchOffer.itinerary`):
  trechos continuam como lista (dados antigos válidos); resumo grava
  `{ "kind": "FARE_SUMMARY", ... }`. Uma única função do domínio lê os dois
  formatos — os casts soltos para lista de trechos saem da API.

### Adaptador

`TravelpayoutsFlightProvider` (`strategy = "TRAVELPAYOUTS"`):

- `GET https://api.travelpayouts.com/v2/prices/latest` com
  `origin`, `destination`, `currency` (minúsculo), `period_type=month`,
  `beginning_of_period=<AAAA-MM>-01`, `one_way`, `limit=1000`,
  `show_to_affiliates=true`; token no header `X-Access-Token` (nunca na URL).
- Resposta validada com Zod. Ficam as entradas do dia pedido (e da volta, em
  ida e volta), classe econômica, preço positivo e `actual` diferente de `false`.
- Cada entrada vira uma oferta-resumo: total = `value × 100` (unidade mínima);
  `observedAt` = `found_at` (sem fuso na resposta; tratado como UTC, nunca no
  futuro); `expiresAt` = `found_at + 72 h`; `qualityFlags = ["CACHED_PRICE"]`.
- **Link de compra:** busca da Aviasales montada pelo adaptador,
  `https://www.aviasales.com/search/{ORIGEM}{DDMM}{DESTINO}{DDMM da volta}{adultos}`;
  host `www.aviasales.com` entra na allowlist da SPEC-018 para `TRAVELPAYOUTS`; o
  marker entra por `AFFILIATE_TRACKING_PARAMS={"TRAVELPAYOUTS":{"marker":"…"}}`
  (SPEC-020), sem mudança de código.
- Recusa (`INVALID_QUERY`, sem chamar a API): classe diferente de econômica ou
  mais de 1 adulto.
- Erros: 401/403 → `AUTHENTICATION`; 429 → `RATE_LIMITED` com `Retry-After`;
  400 → `INVALID_QUERY`; 5xx/rede → `UNAVAILABLE`; tempo esgotado → `TIMEOUT`;
  JSON ou formato inválido → `MALFORMED_RESPONSE`.
- Nenhuma entrada no dia → `no_offers` (já tratado de ponta a ponta).

### Price-worker

- `PriceObservation.observedAt` passa a ser o `observedAt` **da oferta** (quando
  o preço foi encontrado), limitado a "agora". Para o provedor simulado é o
  mesmo instante de antes.
- **Mesmo fato não vira observação nova:** se o preço selecionado tem o mesmo
  instante, valor e assinatura da última observação do alvo, a execução termina
  `SUCCEEDED` sem gravar observação nem publicar `PriceObserved` (alertas não
  reavaliam o mesmo dado), e o alvo é reagendado. Métrica
  `price_observation_total{result="unchanged"}`.

### Configuração (SPEC-024)

- `FLIGHT_PROVIDER` aceita `simulated` e `travelpayouts`.
- `TRAVELPAYOUTS_TOKEN` (segredo, mín. 16) — obrigatório quando
  `FLIGHT_PROVIDER=travelpayouts`; `FLIGHT_PROVIDER_TIMEOUT_MS` (padrão 10000).
- Com `travelpayouts`, a trava de produção da SPEC-024 deixa passar o provedor
  (o e-mail simulado continua bloqueando produção).

### API e web

- Ofertas da busca e das promoções trazem `fareSummary` (ou `null`) e
  `durationMinutes` pode ser `null`. `segments` fica vazio para resumo.
- Cartão de oferta e de promoção mostram, para resumo: "menor preço encontrado
  para o dia", escalas, duração quando houver e a idade do preço — sem horário
  nem companhia (não temos esse dado).

## Segurança

- Token só em variável de ambiente, só no header, nunca logado (o logger já
  redige campos `token`).
- Resposta externa validada antes de virar oferta.

## Observabilidade

Métricas existentes de provider (`provider_call_total`, duração, erros) com
`provider="TRAVELPAYOUTS"`; `price_observation_total{result}` ganha `unchanged`.

## Critérios de aceitação

- **AC-1** Resposta real (fixture) do dia pedido vira oferta-resumo com total,
  escalas, duração, `observedAt = found_at` e link da Aviasales.
- **AC-2** Entradas de outro dia, de outra volta, de classe executiva ou com
  `actual=false` são ignoradas; nenhuma restante → `no_offers`.
- **AC-3** Erros HTTP e de formato viram a classe de `ProviderError` da tabela.
- **AC-4** O token vai no header, nunca na URL.
- **AC-5** Domínio: oferta-resumo elegível só para a rota/data/volta pedidas;
  oferta com trechos **e** resumo é inelegível.
- **AC-6** Itinerário gravado: lista antiga e resumo novo são lidos pela mesma
  função; formato desconhecido é rejeitado.
- **AC-7** Observação gravada com o `observedAt` da oferta; repetir o mesmo
  fato não grava observação nem evento, e reagenda o alvo.
- **AC-8** `FLIGHT_PROVIDER=travelpayouts` sem `TRAVELPAYOUTS_TOKEN` impede o startup.
- **AC-9** Link de compra da Aviasales passa pela allowlist e recebe o marker
  configurado.
- **AC-10** Execução real: monitoramento SAO → NYC recebe preço real da API.

## Testes

Domínio (resumo e itinerário gravado), adaptador com fixtures e `fetch` falso,
config, price-worker com Postgres real, e2e da API (busca com resumo, promoção
com resumo), web (formatação do resumo), e a verificação real AC-10.

## Rollout e rollback

`FLIGHT_PROVIDER=simulated` volta ao comportamento anterior sem deploy de
código. Sem migração (itinerário é JSON). Observações antigas continuam legíveis.

## Questões em aberto

- Prazo de 72 h para um preço do cache ainda valer como atual — proposta;
  calibrar com dados reais.
- Termos de uso da Travelpayouts para exibir o preço do cache e enviar alertas
  (revisão do owner antes de produção).

## Evidência de implementação

2026-10-07, branch `feat/travelpayouts-provider`.

- Domínio: `FareSummary` em `FlightOffer`; elegibilidade, assinatura,
  duração/escalas e seleção para resumo; `stored-itinerary.ts` como dono do
  formato gravado (lista antiga continua válida) — 20 testes novos, os 188
  anteriores inalterados.
- Allowlist SPEC-018: `TRAVELPAYOUTS → www.aviasales.com` (ADR-008).
- Adaptador `TravelpayoutsFlightProvider` — 17 testes com `fetch` falso
  (formato real, filtros, erros HTTP, `Retry-After`, timeout, token só no
  header).
- Config: `FLIGHT_PROVIDER=travelpayouts`, `TRAVELPAYOUTS_TOKEN`,
  `FLIGHT_PROVIDER_TIMEOUT_MS`; regras entre campos no `loadConfig` — 5 testes.
- Price-worker: `observedAt` da oferta (limitado a agora), "mesmo fato" →
  `SUCCEEDED` sem observação nem evento (`persistUnchangedResult`), itinerário
  pelo domínio — 4 testes; mais 1 de auditoria (abaixo).
- API: busca e promoções leem o itinerário pelo domínio (os casts soltos
  saíram) e devolvem `fareSummary` — e2e `fare-summary.e2e.spec.ts` (3 casos,
  incluindo marker de afiliado no link da Aviasales). Escritos depois do
  código: verificam, mas não passaram pela fase red.
- Web: cartões mostram "Menor preço encontrado para DD/MM" para resumo;
  formatação de duração deduplicada (3 cópias) em `lib/domain/flight-format.ts`.
- Suíte: 731 testes (antes do achado abaixo); format, lint, typecheck,
  check:design e build verdes.
- **AC-10, execução real** (scheduler + price-worker com
  `FLIGHT_PROVIDER=travelpayouts`, banco local): o monitoramento SAO → NYC em
  17/11 recebeu R$ 2.568 da API, gravado como `FARE_SUMMARY` (direto, duração
  não informada), `observedAt` 00:00 UTC (quando a fonte viu o preço) contra
  `createdAt` 01:53 (quando gravamos), link da Aviasales, 1 `PriceObserved`.
  Token ausente de todos os logs.
- **Achado na execução real:** a `SearchExecution` ficava com
  `providerStrategy=SIMULATED` (padrão do alvo) mesmo consultando a
  Travelpayouts. Corrigido: o price-worker registra o provedor que de fato
  consulta ao reivindicar a execução — teste de regressão incluído.
- Também observado: algumas entradas do cache vêm com `found_at` em
  meia-noite exata e sem duração (a fonte parece saber só o dia).
