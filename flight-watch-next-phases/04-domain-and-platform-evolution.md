# Evolução de domínio e plataforma

## Regra de separação

Não reutilizar `Watch` para representar toda interação de compra. O domínio
deve separar intenção persistente, execução de busca, oferta observada e
composição de pacote.

## Entidades propostas

### `FlightSearch`

Uma busca do usuário, síncrona ou assíncrona, com filtros e modo de exploração.
Não é ainda um Watch.

Campos conceituais:

- `id`, `userId` opcional para busca pública;
- origem e destino, podendo destino ser `ANYWHERE`;
- janela de datas e flexibilidade;
- passageiros, cabine, moeda e mercado;
- filtros de escalas, duração, companhia e orçamento;
- `status`: `PENDING`, `RUNNING`, `SUCCEEDED`, `PARTIAL`, `FAILED`, `EXPIRED`;
- `createdAt`, `expiresAt` e `correlationId`.

### `FlightOffer`

Snapshot normalizado de uma opção de voo retornada por fonte autorizada.

- `sourceProvider` e `sourceOfferId`;
- origem/destino e trechos;
- partida/chegada local e timezone;
- escalas, duração, companhias e cabine;
- preço base, taxas conhecidas, total e moeda;
- bagagem quando a fonte informar;
- `observedAt`, `expiresAt`, `deepLink`;
- assinatura/idempotency key.

Oferta é imutável como snapshot. Correções geram novo snapshot ou evento de
atualização, não mutação silenciosa do histórico.

### `Deal`

Uma classificação de oportunidade sobre uma ou mais ofertas.

- `dealType`: `TARGET_PRICE`, `HISTORICAL_LOW`, `PERCENTAGE_BELOW_REFERENCE`,
  `FLASH_WINDOW`, `PACKAGE_VALUE`;
- referência usada;
- explicação humana;
- confiança/qualidade da comparação;
- início e fim da validade;
- oferta principal e ofertas comparáveis.

“Promoção” não deve ser um booleano sem justificativa.

### `Destination`

Catálogo de cidades, aeroportos, países, coordenadas aproximadas, aliases,
timezone e relações de hub. A origem de geodados deve ser licenciada e
versionada.

### `PackageOffer`

Composição explícita de itens:

- voo(s);
- hospedagem;
- traslado/atividade, quando existir;
- preço por componente e total;
- fornecedor de cada componente;
- política de validade e regras de cancelamento, quando disponíveis;
- link de compra.

Não apresentar “pacote” se houver apenas uma sugestão editorial sem preço
componível.

### Relação com o domínio atual

```text
FlightSearch ──1:N── FlightOffer ──0:N── Deal
      │                         └──0:1── Watch (intenção derivada)
      └──0:N── PackageOffer

SearchTarget ──1:N── Watch ──1:N── PriceObservation
```

`SearchTarget` continua otimizado para observação recorrente e compartilhada.
`FlightSearch` é consulta de descoberta; uma integração pode reutilizar um
adaptador/provider, mas não deve compartilhar tabelas sem contrato claro.

## APIs planejadas

### Público

- `POST /v1/searches/flights` — iniciar busca de passagens;
- `GET /v1/searches/flights/:id` — consultar estado/resultados;
- `GET /v1/opportunities` — promoções e oportunidades agregadas;
- `GET /v1/destinations/:id` — resumo de destino e ofertas;
- `GET /v1/packages` — pacotes disponíveis conforme filtros.

### Autenticado

- `POST /v1/offers/:id/watch` — derivar Watch de uma oferta;
- `GET /v1/watches` e `GET /v1/watches/:id` — incluir a última oferta observada
  e seu link de compra quando disponível;
- `POST /v1/searches/:id/save` — salvar critérios, se necessário;
- `GET /v1/me/recommendations` — recomendações baseadas em preferências
  explícitas.

Toda resposta de oferta deve carregar frescor, fonte e validade. Nenhum endpoint
deve retornar oferta como se fosse garantia de emissão.

## Compra a partir de um Watch

O banco já possui `PriceObservation.deeplink`; a próxima implementação deve
levar essa informação até a projeção do Watch:

```text
PriceObservation mais recente
  → WatchListItem.currentOffer
  → WatchCard / WatchDetail
  → link externo do fornecedor
```

`currentOffer` deve carregar, no mínimo, `amountMinor`, `currency`,
`purchaseUrl`, `provider`, `observedAt` e `expiresAt`. O preço mostrado no card é
o preço da observação vinculada ao link; não é uma promessa de preço no
checkout.

Regras:

- o link é persistido como snapshot da oferta, não montado a partir de rota ou
  texto do usuário;
- somente URLs HTTPS de providers permitidos entram na resposta;
- sem deep link válido, o card não inventa um botão de compra;
- link expirado pode ser exibido como referência, mas com estado expirado e sem
  linguagem de disponibilidade atual;
- o clique deve gerar métrica de produto sem colocar URL completa como label;
- a página de compra é externa nesta fase; o Flight Watch não recebe cartão,
  reserva nem confirma emissão.

## Provedores e compliance

Antes da implementação real:

1. listar provedores que permitem busca recorrente e deep link;
2. validar cobertura de Brasil, moedas, bagagem e pacotes;
3. confirmar limites, preço, atribuição e armazenamento dos dados;
4. escolher primeiro provider de produção;
5. manter `SimulatedProvider` para testes e demonstração.

Scraping não é plano de integração. Se uma fonte não autorizar automação,
ela não entra no caminho de produção.

## Busca síncrona versus assíncrona

Primeira entrega recomendada:

- API cria `FlightSearch`;
- worker/provider executa;
- frontend exibe estado parcial e polling controlado;
- resultados expiram e podem ser atualizados explicitamente.

Isso evita bloquear a API em uma consulta externa lenta e reutiliza o padrão de
jobs já existente.

## Observabilidade nova

Métricas mínimas:

- `flight_search_total{result,mode}`;
- `flight_search_duration_seconds{provider}`;
- `flight_offers_returned_total{provider}`;
- `flight_offer_click_total{provider}`;
- `deal_classification_total{type}`;
- `package_search_total{result}`;
- `map_interaction_total{action}`.

Não usar user ID, e-mail, aeroporto individual ou rota completa como label de
alta cardinalidade sem uma decisão explícita.
