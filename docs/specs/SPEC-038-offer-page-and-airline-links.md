# SPEC-038 — Página "Ver oferta" e compra no site da companhia aérea

Status: draft — aguardando revisão do owner
Owner: Discovery
Dependências: SPEC-018 (link de compra), SPEC-020 (afiliado e transparência),
SPEC-029 (catálogo de lugares), SPEC-030 (provedor Travelpayouts), SPEC-031
(calendário de preços), SPEC-032/034 (promoções e vitrine), SPEC-033 (página
da rota), ADR-008 (fonte de preços)
Decisões do owner: conversa de 2026-10-14 (ver "Decisões")

## Objetivo

Toda passagem mostrada no site tem um botão **"Ver oferta"** que abre uma
página com tudo o que sabemos dela — companhia aérea, voo, horário,
aeroportos, duração, escalas, preço e idade do preço — e, a partir dali, a
pessoa compra **no site da companhia aérea** (LATAM, GOL, Azul…), que passa
mais confiança do que uma agência desconhecida.

## Decisões do owner (2026-10-14)

- **D1** Todo cartão de passagem ganha "Ver oferta", que leva a uma
  subpágina com os dados da passagem. Referência visual: o mockup "Home
  Logado" (cartão em destaque com rota, preço, quanto está abaixo, gráfico,
  dados da viagem e botões).
- **D2** O botão principal de compra leva ao **site da companhia aérea**, não
  mais à Aviasales. A perda da comissão foi aceita "por enquanto".
- **D3** Um botão **secundário** "Comparar em agências" continua existindo,
  com parceiro configurável: Aviasales hoje; Decolar (ou outro) quando o
  owner for aprovado num programa de afiliados. Trocar de parceiro não exige
  mudar código.
- **D4** Os preços continuam vindo da Travelpayouts. Buscar preço direto nos
  sites das companhias foi **descartado**: as companhias não têm API pública,
  e raspagem é proibida pelos termos delas e por este projeto (CLAUDE.md §2.2,
  §22). O owner vai perguntar ao suporte da Travelpayouts se pode exibir os
  preços com link para a companhia (ver "Perguntas em aberto").

## Fora do escopo

- Preço consultado direto na companhia (D4), NDC e GDS.
- Venda ou reserva dentro do site.
- Hotéis, pacotes, bagagem e marcação de assento.
- Links pré-preenchidos para companhias além de LATAM, GOL e Azul (as outras
  ficam só com o botão secundário nesta versão; ver "Links por companhia").
- Integração com a Decolar (depende de aprovação no programa; entra como
  parceiro novo depois, com a decisão registrada em ADR).

## O que muda para o usuário

### Cartões

Os cartões de passagem passam a ter **"Ver oferta"** como ação principal,
no lugar de "Comprar passagem":

| Onde                          | Componente hoje                                           | "Ver oferta" leva a                       |
| ----------------------------- | --------------------------------------------------------- | ----------------------------------------- |
| Promoções (`/opportunities`)  | `promotions/promotion-card.tsx`                           | página da oferta pública                  |
| Cartão do topo da home        | `home/hero-live-card.tsx`                                 | página da oferta pública                  |
| Vitrine "Destaques do Brasil" | `promotions/promotion-card.tsx`                           | página da oferta pública                  |
| Feed antigo (motor desligado) | `deals/deal-card.tsx`                                     | página da oferta pública                  |
| Página da rota                | `route/route-prices.tsx`                                  | página da oferta pública                  |
| Resultado de busca            | `search/search-results.tsx`, `search/[id]/offer-card.tsx` | página da oferta da busca                 |
| Monitoramentos                | `watches/watch-card.tsx`, `watch-highlight.tsx`           | página do monitoramento (`/watches/[id]`) |

O botão de compra (`PurchaseButton`) sai dos cartões e fica só nas páginas
de oferta e do monitoramento: quem compra passa antes pela página que
mostra a companhia e o aviso sobre o preço.

### Página da oferta

Conteúdo, de cima para baixo (layout do mockup, com os tokens e componentes
do `docs/DESIGN-SYSTEM.md` — o mockup é referência de disposição, não de
cores):

1. **Cartão em destaque**: origem → destino (códigos e nomes), data,
   **preço**, quanto está abaixo das datas próximas (quando for promoção),
   **companhia com logo**, número do voo, horário de saída, aeroportos,
   duração e escalas ("Direto" ou "1 escala").
2. **Botões**:
   - principal: **"Ver no site da LATAM"** (nome da companhia);
   - secundário: **"Comparar em agências"** (parceiro de D3);
   - **"Monitorar esta passagem"** (fluxo de criação de monitoramento que
     já existe).
3. **Aviso de preço**, sempre visível perto do botão: "Preço visto em
   agências parceiras em 14/10 às 10:12. No site da companhia o valor pode
   ser diferente." Nunca "menor preço do mercado" (CLAUDE.md §2.3).
4. **Preço por data**: o gráfico `PriceByDateChart` da página da rota, com
   a data da oferta marcada.
5. Link para a **página da rota**.

Estados distintos (CLAUDE.md §6.1):

- **sem preço para a data**: "Não temos preço para este dia" + link para a
  página da rota; nada de preço zero;
- **preço com mais de 72 h** (SPEC-030): mostra o preço como desatualizado,
  sem destaque de promoção;
- **companhia desconhecida ou sem link**: sem botão principal; o secundário
  vira o principal;
- **motor desligado / fonte fora**: a página explica e aponta para a rota.

### Endereços

- **Oferta pública** (promoções, vitrine, rota, home):
  `/voos/{rota}/{AAAA-MM-DD}`, onde `{rota}` é o segmento canônico da
  SPEC-033 (ex.: `/voos/sao-paulo-SAO-para-rio-de-janeiro-RIO/2026-11-29`).
  Só ida nesta versão, como as promoções. Slug fora do formato → 308 para
  o canônico, como na SPEC-033.
- **Oferta de uma busca**: `/search/{searchId}/oferta/{offerId}` — mostra o
  preço guardado naquela busca (SPEC-014), não recalcula.
- **Monitoramento**: `/watches/{id}` ganha o mesmo cartão em destaque e os
  mesmos botões, com o último preço observado.

SEO: a página da oferta pública é `noindex, follow`, com canonical para a
página da rota — uma página por data seria conteúdo repetido. Fica fora do
sitemap.

## Dados

### Fonte: outra consulta da Travelpayouts

Hoje o adaptador usa `v2/prices/latest` (SPEC-030), que não informa a
companhia. Passa a usar **`aviasales/v3/prices_for_dates`**, que devolve
por preço (verificado em 2026-10-14, SAO → RIO, novembro):

| Campo da fonte                          | Exemplo                     | Uso                          |
| --------------------------------------- | --------------------------- | ---------------------------- |
| `airline`                               | `AD`                        | companhia                    |
| `flight_number`                         | `4193`                      | voo AD 4193                  |
| `origin_airport`, `destination_airport` | `GRU`, `SDU`                | aeroportos                   |
| `departure_at`                          | `2026-11-29T10:10:00-03:00` | data e horário de saída      |
| `duration_to`, `transfers`              | `60`, `0`                   | duração e escalas            |
| `price`                                 | `182`                       | preço (BRL)                  |
| `gate`                                  | `Kupi.com`                  | **não exibido** (ver abaixo) |
| `link`                                  | `/search/SAO2911RIO1?t=…`   | link do parceiro secundário  |

- O adaptador continua entregando **um preço por dia** (o menor), para não
  mudar a avaliação de promoções (SPEC-032) nem o calendário (SPEC-031).
- `gate` (onde o preço foi visto) **não aparece** na página: vem com nomes
  de agências estrangeiras, às vezes em cirílico, e não ajuda a pessoa. A
  página diz "agências parceiras".
- O preço continua sendo de cache: `observedAt` segue a regra da SPEC-030
  (instante em que a fonte viu o preço).
- **Antes de trocar**, comparar a cobertura das duas consultas (ver
  "Fatias", F1). Se a nova cobrir bem menos rotas, as duas convivem: a
  antiga para o calendário, a nova para os detalhes.

### Domínio

`FareSummary` (`packages/domain/src/pricing/flight-offer.ts`) ganha campos
**opcionais** — dados antigos continuam válidos, e o sistema nunca inventa
um campo que a fonte não deu (ADR-004, SPEC-030):

```ts
carrierCode?: string;       // IATA da companhia, ex.: "AD"
flightNumber?: string;      // "4193"
departureAt?: string;       // RFC 3339 com o fuso da origem
originAirport?: string;     // IATA do aeroporto, ex.: "GRU"
destinationAirport?: string;
```

`toStoredItinerary`/`parseStoredItinerary` aceitam os dois formatos (com e
sem os campos). Sem migração: o itinerário é JSON.

O cache do calendário (Redis, SPEC-031) muda de versão de chave, para as
entradas antigas, sem companhia, se reconstruírem sozinhas.

### Catálogo de companhias

- Tabela nova `airlines` (`code` IATA, `name`, `updatedAt`), sincronizada
  pelo scheduler junto do catálogo de lugares (SPEC-029), a partir do
  arquivo público de companhias da Travelpayouts. Migração só aditiva.
  Nenhuma lista de companhias no código.
- **Logos**: servidos pelo nosso próprio domínio via `next/image`
  (`remotePatterns` para o CDN de logos da fonte). Assim o navegador da
  pessoa não fala com terceiros e a Política de Privacidade não muda, e a
  CSP (`img-src`) continua só com o próprio site e o OpenStreetMap.
- Companhia sem logo ou fora do catálogo: mostra o código e o nome, se
  houver.

## Links por companhia

### Botão principal: site da companhia

- Função pura no domínio, `airlineSearchUrl(carrierCode, query)`, com uma
  **estratégia por companhia** (CLAUDE.md P05), versionada e testada:

  | Companhia | Código | v1                                            |
  | --------- | ------ | --------------------------------------------- |
  | LATAM     | `LA`   | busca com origem, destino, data e passageiros |
  | GOL       | `G3`   | idem                                          |
  | Azul      | `AD`   | idem                                          |
  | outras    | —      | sem botão principal (só o secundário)         |

- Os formatos de link de busca das companhias **não são documentados**.
  Cada estratégia é verificada à mão na F1 e tem teste com a URL esperada.
  Se o link de busca de uma companhia não abrir a busca, a estratégia dela
  cai para a **página inicial** do site da companhia.
- Os aeroportos do link são os da oferta (`originAirport`, ex.: GRU), não o
  código da cidade.
- **Allowlist** (SPEC-018): os hosts de LATAM, GOL e Azul entram na lista de
  hosts permitidos, por decisão registrada em **ADR-009** (destino do botão
  de compra), escrito junto desta spec. Nenhuma URL fora da lista chega ao
  usuário.
- O link abre em nova aba com `rel="noopener"`. Sem `sponsored`, porque não
  é link pago; o `check:design` ganha essa exceção explícita.

### Botão secundário: comparar em agências

- Parceiro escolhido por configuração, `PURCHASE_COMPARE_PARTNER`
  (`aviasales` | `none`; padrão `aviasales`), em `packages/config`,
  `.env.example` e na factory, como os outros adaptadores (CLAUDE.md §10.2).
  Parceiro novo (Decolar) entra no enum com ADR e allowlist próprios.
- Aviasales: o link vem do campo `link` da fonte, montado com o marcador de
  afiliado como hoje (SPEC-020), com `rel="sponsored noopener"`.
- O aviso de comissão (SPEC-020) aparece **só** perto do botão secundário,
  porque o principal não rende comissão.

### Página "Como ganhamos dinheiro"

`/transparencia` passa a dizer que o botão principal leva à companhia sem
comissão e que só "Comparar em agências" pode render comissão.

## Contrato da API

- `GET /v1/routes/:origin/:destination/offers/:date` — oferta pública do
  dia: mesmos dados do cartão em destaque, o calendário do mês para o
  gráfico, status (`OK`, `NO_PRICE`, `STALE`, `DISABLED`). Lê o mesmo cache
  e o mesmo orçamento da página da rota (`ROUTE_PAGE_DAILY_CALL_BUDGET`),
  com rate limit `pages`.
- Os contratos que já devolvem preço (promoções, destaques, rota, busca,
  monitoramento) ganham, quando houver, um objeto `flight` opcional:
  `{ carrierCode, carrierName, flightNumber, departureAt, originAirport,
destinationAirport, durationMinutes, stops }`, e os dois links:
  `airlineUrl` (pode ser `null`) e `compareUrl` (pode ser `null`). Campos
  aditivos: clientes antigos não quebram.
- Schemas em `packages/contracts` (Zod), como os demais.

## Observabilidade

- `offer_page_requests_total{result}` — `ok`, `no_price`, `stale`,
  `disabled`.
- `purchase_link_click_total{kind}` — `airline`, `compare`. **A companhia
  não vira label** (CLAUDE.md §11.2); a contagem por companhia, se for
  preciso, vem de log com o código da companhia, sem dado pessoal.
- `airline_link_missing_total{reason}` — `unknown_carrier`,
  `no_strategy`, `not_allowed`.
- Log `airlines_catalog_synced` (quantidade, duração).

## Segurança e privacidade

- Toda URL externa passa pela allowlist (SPEC-018).
- Logos via nosso domínio: nenhuma requisição nova do navegador a
  terceiros.
- A página pública não tem dado pessoal; a do monitoramento continua com a
  autorização de hoje (só o dono).

## Custo

- Mesmo orçamento diário de chamadas da página da rota; a página da oferta
  lê do cache da rota e não aumenta o número de chamadas por visita.
- O catálogo de companhias é baixado uma vez por dia.

## Fatias

| Fatia | Conteúdo                                                                                                                                                               | Depende de      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| F1    | **Spike**: cobertura de `prices_for_dates` × `v2/prices/latest` em 20 rotas (nacionais e internacionais); formato do link de busca de LATAM, GOL e Azul, testado à mão | —               |
| F2    | Adaptador na consulta nova, `FareSummary` com os campos novos, cache com chave nova                                                                                    | F1              |
| F3    | Catálogo de companhias (tabela, sync, logos)                                                                                                                           | —               |
| F4    | Página da oferta pública, "Ver oferta" em todos os cartões, página do monitoramento e da busca com o cartão em destaque                                                | F2, F3          |
| F5    | Botão principal para a companhia (ADR-009 + allowlist), secundário configurável, `/transparencia` atualizada                                                           | F4 e pergunta 1 |

F1 a F4 não mudam o destino da compra e podem ir para a `main` antes da
resposta da Travelpayouts.

## Critérios de aceitação

- **AC-1** Todo cartão listado em "Cartões" mostra "Ver oferta" e leva à
  página certa.
- **AC-2** A página da oferta mostra companhia (nome e logo), voo, horário,
  aeroportos, duração, escalas, preço e idade do preço quando a fonte
  informa; quando não informa, o campo não aparece (nada inventado).
- **AC-3** Estados sem preço, desatualizado, sem companhia e motor
  desligado são distintos e testados.
- **AC-4** Para LATAM, GOL e Azul, "Ver no site da …" abre a busca da
  companhia com origem, destino e data (ou a página inicial, se a F1
  mostrar que a busca não aceita link); para outras companhias, só
  "Comparar em agências".
- **AC-5** Nenhuma URL fora da allowlist chega à resposta da API.
- **AC-6** `PURCHASE_COMPARE_PARTNER=none` remove o botão secundário sem
  quebrar a página.
- **AC-7** Dados antigos (sem os campos novos) continuam aparecendo em
  monitoramentos e buscas, sem erro.
- **AC-8** O aviso de preço aparece sempre ao lado do botão da companhia.

## Testes

- Domínio: `airlineSearchUrl` por companhia (URL esperada), fallback para a
  página inicial, companhia desconhecida; `FareSummary` com e sem os campos
  novos (ida e volta pelo `toStoredItinerary`/`parseStoredItinerary`).
- Provedor: parser de `prices_for_dates` com fixture real (anonimizada),
  menor preço por dia, `gate` descartado, campos ausentes.
- API (e2e): oferta pública nos quatro estados, allowlist, parceiro `none`.
- Web/E2E (Playwright, provedor simulado): "Ver oferta" a partir de
  promoção, rota, busca e monitoramento; botões e aviso na página.
- Navegador: desktop e celular, teclado, sem erro no console.

## Rollout, rollback e kill switch

- F2 a F4 entram sem mudar o destino da compra.
- F5 liga com a ADR-009; para voltar à Aviasales como principal, reverter o
  commit da F5 (a allowlist volta junto).
- `PURCHASE_COMPARE_PARTNER=none` desliga o secundário.
- Migração só aditiva (`airlines`); rollback não precisa apagar a tabela.

## Perguntas em aberto

1. **Termos da Travelpayouts** (`BLOQUEADO` para a F5): o owner perguntou se
   pode exibir os preços da Data API com link para o site da companhia. Se
   a resposta for não, a F5 fica com a Aviasales como principal e a
   companhia como informação (sem botão).
2. Cobertura da consulta nova (respondida na F1).
3. Formato dos links de busca de LATAM, GOL e Azul (respondido na F1).
4. Companhias internacionais: quais entram depois de LATAM, GOL e Azul
   (decidir com dados de cliques do beta).

## Evidência de implementação

Ainda não implementada.
