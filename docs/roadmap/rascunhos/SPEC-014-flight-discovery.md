# SPEC-014 — Descoberta e busca de passagens

Status: rascunho para aprovação  
Dependências: SPEC-001, SPEC-003, SPEC-004, SPEC-007, SPEC-008, SPEC-009 e SPEC-010

## Objetivo

Permitir que uma pessoa pesquise opções de passagem sem criar um Watch antes.
A busca pode ser pública com limites de abuso ou autenticada para salvar e
monitorar resultados.

## Fora do escopo

- emissão, reserva ou pagamento;
- garantia de disponibilidade;
- scraping sem autorização;
- pacotes e mapa como requisito de primeira entrega;
- recomendação opaca.

## Entrada mínima

```json
{
  "origin": "GRU",
  "destination": "ANYWHERE",
  "departureDate": "2027-06-12",
  "returnDate": null,
  "dateFlexibilityDays": 3,
  "tripType": "ONE_WAY",
  "adults": 1,
  "cabin": "ECONOMY",
  "currency": "BRL",
  "market": "BR",
  "maxStops": 1,
  "maxPriceMinor": null
}
```

## Contrato de oferta

Cada oferta precisa conter:

- `id`, `searchId`, `provider`;
- rota e trechos completos;
- preço total e componentes conhecidos;
- moeda, cabine, passageiros;
- duração total e escalas;
- observação e expiração;
- `deepLink` autorizado;
- `availabilityStatus` e `qualityFlags`.

Quando uma oferta originar um Watch, o `deepLink` e o contexto de preço devem
continuar disponíveis para o card do monitoramento. A associação é com o
snapshot da oferta observada, não com uma URL recriada depois.

## Comportamento

1. Validar origem, datas, moeda, mercado e flexibilidade.
2. Criar busca com status `PENDING`.
3. Enfileirar job idempotente.
4. Consultar provider simulado ou autorizado.
5. Validar e normalizar cada oferta.
6. Publicar resultados parciais quando possível.
7. Marcar busca como `SUCCEEDED`, `PARTIAL`, `FAILED` ou `EXPIRED`.
8. Expirar ofertas conforme `expiresAt`.

## Critérios de aceitação

- destino `ANYWHERE` funciona sem mudar o contrato de Watch;
- duas buscas iguais podem compartilhar cache/job sem compartilhar histórico
  incorretamente;
- preço exibido é inteiro em unidade mínima;
- falha do provider não aparece como “nenhuma passagem existe”;
- a lista mostra fonte e frescor;
- abrir uma oferta não cria Watch automaticamente;
- “monitorar” cria um Watch com confirmação explícita;
- o Watch derivado expõe a última oferta observada e seu `purchaseUrl` quando o
  provider entregar deep link válido;
- o link de compra abre o canal externo autorizado e o preço é rotulado como
  observado, não garantido;
- request público sofre rate limit;
- dados do provider não vazam para logs.

## Observabilidade

- duração da busca;
- resultado por provider;
- quantidade de ofertas normalizadas, descartadas e expiradas;
- idade do resultado ao clique;
- correlation ID do request ao job/provider.
