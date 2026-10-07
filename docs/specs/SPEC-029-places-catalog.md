# SPEC-029 — Catálogo de cidades e aeroportos via API

Status: implementada (ver "Evidência de implementação")
Owner: Monitoring / Discovery
Dependências: ADR-008, SPEC-001, SPEC-014, SPEC-015, SPEC-016, SPEC-024
Fase: Travelpayouts Fase 1, fatia 1 de 4

## Objetivo

Qualquer cidade com voo comercial pode ser origem ou destino, escolhida pelo
nome ("Lisboa", "nova york", "GRU"), sem nenhuma lista de aeroportos no código.

Hoje a mesma lista de 7 aeroportos está em 6 lugares: validação da API
(`supported-catalog.ts`), três formulários do web e um arquivo de coordenadas e
nomes usado pelo mapa e pelo `RouteLine`.

## Fora do escopo

- precisão por aeroporto (Fase 2, ADR-008 §3);
- moedas e mercados: continuam `BRL`/`USD` e `BR` — são decisão de negócio,
  não dado de catálogo;
- busca de lugar por país ou região ("qualquer lugar").

## Comportamento

### Lugar = cidade (Fase 1)

Origem e destino de busca e de monitoramento são **cidades** (código IATA de
cidade, ex.: `SAO`, `NYC`, `RIO`). A API aceita também um código de aeroporto
e o **normaliza para a cidade dele** (`GRU` → `SAO`) antes de qualquer outra
regra; a resposta devolve o código da cidade. Cidade sem aeroporto comercial é
recusada (`UNSUPPORTED_SEARCH`), assim como origem e destino que viram a mesma
cidade depois da normalização (`GRU → CGH` = `SAO → SAO`). Filtros de promoções
aceitam o código digitado **ou** a cidade dele, para alvos gravados antes desta
spec (com código de aeroporto) continuarem aparecendo.

### Catálogo

Tabela `places`, chave `(code, kind)` — código de cidade e de aeroporto podem
coincidir (`BSB` é as duas coisas):

| Campo                               | Cidade                                                                    | Aeroporto                   |
| ----------------------------------- | ------------------------------------------------------------------------- | --------------------------- |
| `code`, `kind`                      | `SAO`, `CITY`                                                             | `GRU`, `AIRPORT`            |
| `name` (pt)                         | São Paulo                                                                 | Guarulhos Cumbica SP        |
| `cityCode`                          | o próprio código                                                          | cidade do aeroporto         |
| `countryCode`, `countryName` (pt)   | `BR`, Brasil                                                              | idem                        |
| `timeZone`, `latitude`, `longitude` | da cidade                                                                 | do aeroporto                |
| `searchable`                        | tem aeroporto com voo comercial                                           | aeroporto com voo comercial |
| `searchText`                        | nome pt e en, país e códigos/nomes dos aeroportos, sem acento e minúsculo | nome e código               |

### Sincronização

- Fonte: `https://api.travelpayouts.com/data/pt/{cities,airports,countries}.json`
  (pública, sem token). Cada registro é validado com Zod; registro inválido é
  descartado e contado, nunca derruba a sincronização.
- O scheduler sincroniza **no startup se o catálogo estiver vazio ou com mais
  de 7 dias**, e depois a cada 24 h. Upsert em lotes numa transação por lote;
  lugares que sumiram da fonte ficam com `searchable=false` (não são apagados:
  monitoramentos antigos continuam exibindo o nome).
- Comando manual: `pnpm --filter @flight-watch/scheduler places:sync`.
- Falha de rede: registra `places_sync_failed`, mantém o catálogo anterior e
  tenta de novo no próximo ciclo.
- Fonte sem nenhuma cidade pesquisável (resposta corrompida) é tratada como
  falha: sem essa proteção, a sincronização desativaria o catálogo inteiro e a
  busca do site pararia.

### API

- `GET /v1/places?q=<texto>&limit=<1-20, padrão 8>` — público, sem sessão.
  Devolve cidades pesquisáveis, cada uma com seus aeroportos comerciais:
  `{ code, name, countryCode, countryName, airports: [{ code, name }] }`.
  Ordem: código exato (de cidade ou de aeroporto) → nome que começa com o
  texto → **todas as palavras digitadas são início de alguma palavra** do
  texto de busca, em qualquer ordem ("nova york" acha "Nova Iorque"); empate
  por número de aeroportos comerciais (indicador de cidade maior: "orlando"
  traz a Flórida antes da Noruega), depois por nome. Texto com menos de 2 caracteres →
  lista vazia. Acento e caixa são ignorados ("sao paulo" acha "São Paulo").
- Criação de monitoramento (SPEC-001) e busca (SPEC-014) validam origem e
  destino no catálogo, após normalizar para cidade.
- Respostas que exibem rota passam a trazer o nome das cidades:
  - monitoramentos (lista, detalhe e transições): `originName`,
    `destinationName`; criação (SPEC-001, rota dentro de `search`):
    `search.originName`, `search.destinationName`;
  - busca: `originName`, `destinationName`;
  - promoções: `originName`, `destinationName` e coordenadas
    (`originCoordinates`, `destinationCoordinates`, `{ lat, lng } | null`).
    Código sem cadastro devolve `null` no nome — a interface mostra o código.

### Web

- Componente `PlaceCombobox` (padrão ARIA combobox, teclado, debounce de
  250 ms), usado nos três formulários no lugar das listas.
- `RouteLine` recebe `originName`/`destinationName` por propriedade.
- O mapa de promoções usa as coordenadas da resposta; rota sem coordenada fica
  só na lista (comportamento atual da SPEC-016).
- `lib/domain/airport-coordinates.ts` é removido.

## Persistência

Migração aditiva: enum `PlaceKind`, tabela `places`. Nenhuma tabela existente
muda. Monitoramentos antigos com código de aeroporto continuam funcionando; o
nome exibido vem da cidade do aeroporto.

## Segurança

- Busca pública, só leitura, consulta parametrizada; `q` limitado a 64
  caracteres.
- A fonte externa é validada antes de gravar (texto, tamanho, coordenadas na
  faixa válida).

## Observabilidade

- `places_sync_total{result}` (`success`, `failed`, `skipped_fresh`);
- `places_sync_records{kind,outcome}` (`upserted`, `invalid`, `disabled`) no
  último ciclo;
- log `places_sync_completed` com contagens e duração.

## Critérios de aceitação

- **AC-1** Nenhuma lista de aeroportos no código (`rg` por `SUPPORTED_AIRPORTS`,
  `SUPPORTED_IATA_CODES`, `AIRPORT_COORDINATES` sem resultados).
- **AC-2** A sincronização grava cidades e aeroportos válidos e descarta os
  inválidos, contando-os.
- **AC-3** Lugar que sumiu da fonte vira `searchable=false`, sem ser apagado.
- **AC-4** Catálogo com menos de 7 dias não é baixado de novo no startup.
- **AC-5** `GET /v1/places?q=sao paulo` devolve São Paulo (`SAO`) com seus
  aeroportos; `q=GRU` também devolve `SAO` em primeiro; `q=lisboa` devolve `LIS`.
- **AC-6** Criar monitoramento com `GRU → JFK` grava `SAO → NYC`.
- **AC-7** Código inexistente ou cidade sem voo comercial → `422 UNSUPPORTED_SEARCH`.
- **AC-8** Respostas de monitoramento, busca e promoções trazem os nomes; promoções
  trazem coordenadas.
- **AC-9** Formulários escolhem cidade pelo nome, por teclado e mouse.

## Testes

- domínio: normalização de texto e ordenação dos resultados (unitário);
- providers: parser da fonte com fixtures, incluindo registros inválidos;
- database: sincronização e busca com Postgres real;
- scheduler: decisão de sincronizar (vazio, velho, recente);
- api: e2e de `/v1/places` e da normalização; suítes existentes passam a
  semear um catálogo mínimo de teste;
- web: unitário da lógica de teclado/seleção do combobox.

## Rollout e rollback

Migração aditiva. Rollback do código mantém a tabela. Se a fonte ficar fora do
ar, o catálogo anterior continua valendo.

## Evidência de implementação

2026-10-06, branch `feat/places-catalog`.

- Domínio (`packages/domain/src/places`): normalização, ordenação e frescor —
  15 testes, incluindo os achados com dados reais ("nova york", "orlando",
  "sao l").
- Fonte (`packages/providers/src/travelpayouts/places-source.ts`): Zod por
  registro; nome em inglês quando falta o português (27% das cidades, 60% dos
  aeroportos); só `iata_type=airport` — 6 testes com fixtures.
- Banco: tabela `places` (migração `20261006230000_add_places_catalog`,
  aditiva), `INSERT ... ON CONFLICT` em lotes de 2.000 numa transação — 16
  testes com Postgres real; 20 mil registros em ~430 ms.
- Scheduler: `runPlacesSync` (startup + 24 h) e `places:sync` — 6 testes.
- API: `GET /v1/places`, normalização em monitoramentos e busca, nomes e
  coordenadas nas respostas — 7 testes e2e; as suítes existentes semeiam o
  catálogo de teste (`TEST_PLACES`).
- Web: `PlaceCombobox` nos três formulários; `RouteLine` e mapa usam dados da
  API; `lib/domain/airport-coordinates.ts` removido — 9 testes de lógica do
  combobox, incluindo a regressão "digitar apagava o texto".
- AC-1: busca por `SUPPORTED_AIRPORTS|SUPPORTED_IATA_CODES|AIRPORT_COORDINATES|airportLabel`
  sem ocorrências (sobra só uma variável local `airportCity` no repositório).
- `apps/api/vitest.config.ts`: `maxWorkers: 4` — sem teto, dezenas de
  Postgres subiam juntos e estouravam o timeout numa máquina de 20 núcleos.
- Suíte total: 675 testes verdes; format, lint, typecheck, check:design e
  build verdes.
- Execução real: sincronização com a fonte verdadeira gravou 18.707 lugares
  (3.466 cidades pesquisáveis) em 657 ms. Com API e web rodando: autocomplete
  "nova york" → NYC [EWR, JFK, LGA], "GRU" → SAO, "orlando" → Flórida primeiro;
  monitoramento `GRU → JFK` gravado como `SAO → NYC` com os nomes; `/search`
  renderiza os dois combobox; detalhe do monitoramento mostra os nomes.
- **Não verificado:** interação no navegador (digitar, abrir a lista, escolher
  por teclado) — sem navegador no ambiente de desenvolvimento.
