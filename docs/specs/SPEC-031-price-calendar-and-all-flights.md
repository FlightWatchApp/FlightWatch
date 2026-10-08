# SPEC-031 — Calendário de preços e "Ver todos os voos"

Status: implementada (ver "Evidência de implementação")
Owner: Discovery
Dependências: ADR-008, SPEC-014, SPEC-018, SPEC-020, SPEC-025, SPEC-029, SPEC-030
Fase: Travelpayouts Fase 1, fatia 3 de 4

## Objetivo

A busca responde as duas perguntas de quem procura passagem, dentro do que a
fonte da Fase 1 permite (ADR-008):

1. **"Quando é mais barato?"** — calendário do mês com o menor preço encontrado
   em cada dia; clicar num dia busca aquela data.
2. **"Quais são todos os voos?"** — botão "Ver todos os voos" que abre a busca
   completa no site parceiro (todas as companhias, com horários), via link de
   afiliado. Na Fase 2 (busca em tempo real) essa lista passa a ser nossa.

## Fora do escopo

- lista de voos dentro do nosso site (Fase 2);
- calendário de dois meses ou de datas flexíveis em volta do dia;
- cache do calendário (cada abertura consulta a fonte; o rate limit da busca
  protege). Atualizado pela SPEC-032: o calendário passou a usar o cache por
  rota-mês do feed de promoções.

## Comportamento

### Provedor (porta ADR-004, capacidades opcionais)

```ts
interface FlightProvider {
  search(...): Promise<ProviderSearchResult>;
  priceCalendar?(query: PriceCalendarQuery): Promise<CalendarDay[]>;
  allFlightsUrl?(query: FlightSearchQuery): string;
}
interface PriceCalendarQuery {
  originIata: string; destinationIata: string;
  month: string;               // AAAA-MM
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  tripLengthDays: number | null; // só ida e volta
  currency: string;
}
interface CalendarDay { date: string; amountMinor: number; stops: number; observedAt: string }
```

- **Travelpayouts:** mesma consulta mensal da SPEC-030; um dia por data, o
  menor preço. Em ida e volta, só entram combinações com a **mesma duração de
  viagem** pedida (`retorno − ida = tripLengthDays`) — o calendário compara
  viagens equivalentes. Preço com mais de 72 h fica fora (mesma regra da oferta).
- `allFlightsUrl` = busca da Aviasales da SPEC-030.
- **Simulado:** calendário determinístico para desenvolvimento; link no host
  simulado da allowlist.
- Provedor sem a capacidade → calendário vazio / sem link (a tela some com o
  bloco, sem erro).

### API

- `GET /v1/price-calendar?origin&destination&month&tripType&tripLengthDays&currency&market`
  — público, mesmo rate limit da busca (SPEC-025); origem/destino normalizados
  para cidade (SPEC-029). Resposta:
  `{ origin, destination, month, currency, days: CalendarDay[] }`, dias em
  ordem. Erro do provedor → `502 PROVIDER_UNAVAILABLE` (a tela some com o bloco).
- Busca (`POST`/`GET /v1/searches/flights`) ganha `allFlightsUrl: string | null`,
  validado pela allowlist (SPEC-018) e com rastreio de afiliado (SPEC-020,
  superfície `SEARCH`). Presente mesmo quando não há oferta — é justamente
  quando a pessoa mais precisa dele.

### Web

- Resultado da busca mostra o calendário do mês da data pesquisada: grade de
  dias, preço em cada dia que tem, destaque no mais barato e no dia escolhido.
  Clicar num dia faz a busca daquele dia. Cada dia é um botão com rótulo
  completo para leitor de tela ("17 de novembro, R$ 2.568, menor preço do mês").
- Botão "Ver todos os voos no site parceiro" (`PurchaseButton` com rótulo
  próprio: nova aba, `rel="sponsored"`, aviso de comissão já existentes).
- Texto da página deixa de prometer "opções disponíveis agora": a Fase 1 mostra
  menores preços encontrados (SPEC-030).

## Segurança e custo

- Uma chamada à fonte por abertura de calendário; protegida pelo rate limit
  `default` (SPEC-025).
- Link passa pela allowlist antes de sair da API.

## Critérios de aceitação

- **AC-1** Travelpayouts: calendário com um dia por data e o menor preço; ida e
  volta só com a duração pedida; preço velho (> 72 h) fora.
- **AC-2** `GET /v1/price-calendar` normaliza cidades, valida mês e duração e
  devolve os dias ordenados.
- **AC-3** Busca devolve `allFlightsUrl` validado, com marker, inclusive sem
  ofertas.
- **AC-4** A tela mostra o calendário, destaca o mais barato e o dia escolhido,
  e cada dia tem rótulo acessível.
- **AC-5** Provedor indisponível no calendário não derruba a página de busca.

## Testes

Unitários do adaptador e do simulado; lógica do calendário no web (grade e
destaques); e2e da API para o endpoint e o link; verificação real com a API.

## Rollout e rollback

Sem migração. Capacidade opcional na porta: provedores sem ela seguem
funcionando.

## Evidência de implementação

2026-10-07, branch `feat/price-calendar`.

- Porta: capacidades opcionais `priceCalendar` e `allFlightsUrl`.
- Travelpayouts: calendário a partir da mesma consulta mensal da SPEC-030
  (refatorada para servir `search` e `priceCalendar`), filtro de duração em ida
  e volta e de preço com mais de 72 h — 4 testes novos, os 17 da SPEC-030
  inalterados. Simulado: calendário determinístico que bate com a busca do
  dia — 3 testes.
- Contratos: `priceCalendarQuerySchema`/`ResponseSchema` (6 testes),
  `allFlightsUrl` na busca, código `PROVIDER_UNAVAILABLE` (502).
- API: `GET /v1/price-calendar` (rate limit da busca, normalização para cidade,
  métrica `price_calendar_fetch_total{result}`) e `allFlightsUrl` validado na
  busca — e2e `price-calendar.e2e.spec.ts`, 4 casos (inclui 502 e link sem
  ofertas).
- Web: `PriceCalendar` (tabela acessível, botões com rótulo completo),
  `PurchaseButton` com rótulo "Ver todos os voos no site parceiro", textos que
  prometiam "disponíveis agora"/"observado agora" trocados; lógica da grade
  com 7 testes (inclui mês começando no meio da semana e volta deslocada).
- Achado: um espaço não separável literal tinha entrado no código no lugar do
  escape `\u00a0` — o lint pegou; trocado pelo escape.
- Suíte: 757 testes verdes; format, lint, typecheck, check:design e build
  verdes.
- **Execução real** (API com `FLIGHT_PROVIDER=travelpayouts`, web em
  produção): calendário SAO → NYC de novembro com 23 dias de preço, mais barato
  em 05/11 por R$ 1.863 (contra R$ 2.568 em 17/11); página do resultado com os
  30 dias, destaque do mais barato e do dia escolhido, "Ver todos os voos" e o
  cartão "Menor preço encontrado para 17/11".
- **Não verificado:** clique num dia do calendário dentro de um navegador.
