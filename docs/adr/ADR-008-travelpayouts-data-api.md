# ADR-008 — Travelpayouts Data API como fonte inicial de preços

Status: aceito  
Data: 2026-10-06  
Decisores: owner (escopo e fases), engenharia (desenho técnico)  
Relacionados: ADR-004, SPEC-020, SPEC-029, SPEC-030, SPEC-031, SPEC-032

## Contexto

O produto é **integral**: qualquer aeroporto e rota, nacional e internacional
(decisão do owner, 2026-10-06; o foco regional foi descartado). A visão tem três
frentes: busca como a de um metabuscador ("todos os voos de todas as
empresas"), monitoramento de rota + data com alerta de queda e vitrine de
promoções das rotas mais procuradas. A receita vem de link de afiliado
(SPEC-020) e assinatura.

`CLAUDE.md` mantinha o provider real `BLOQUEADO` aguardando a Duffel. A Duffel
é API de reserva: sem link de afiliado e com tarifa de excesso de busca
(US$ 0,005 por busca acima de 1.500 buscas por reserva), incompatível com
monitoramento recorrente sem vender pelo checkout dela.

### Alternativas avaliadas (2026-10-06)

| Opção                                        | Situação                                        | Resultado                   |
| -------------------------------------------- | ----------------------------------------------- | --------------------------- |
| Travelpayouts **Data API** (cache Aviasales) | cadastro grátis, aberto; afiliado embutido      | **escolhida para a Fase 1** |
| Travelpayouts **Search API** (tempo real)    | exige ≥ 50 mil MAU, sem exceção                 | Fase 2                      |
| Skyscanner Travel API                        | exige ≥ 100 mil MAU e plano de negócio          | descartada por ora          |
| Kiwi Tequila                                 | novos parceiros só por convite desde 2024       | descartada                  |
| Amadeus Self-Service                         | encerrado em 17/07/2026                         | descartada                  |
| Duffel                                       | reserva, sem afiliado, taxa de excesso de busca | descartada para este modelo |
| Raspagem (Google Flights e similares)        | viola termos e `PRODUCT.md`                     | proibida                    |

### Evidência medida (token real, 2026-10-06)

- Rotas grandes: 21 de 22 com 23 a 175 datas futuras com preço; mediana da
  idade do preço ≈ 1 dia (SAO-RIO 175, SAO-LIS 166, SAO-NYC 105).
- Rotas pequenas: CGR só com SAO/RIO/SSA; DOU praticamente vazio; BEL-BSB 0.
- `v2/prices/latest` (por mês) é o endpoint mais rico: **um preço por data**
  (o menor encontrado), com escalas, duração, vendedor e `found_at`. Sem
  horário, companhia nem trechos.
- `v3/prices_for_dates` traz horário/companhia, mas quase nada por data exata
  (SAO-NYC 17/11: 0 ofertas; novembro inteiro: 2).
- `v1/prices/calendar` ignorou a data pedida — não confiável.
- Códigos: a resposta vem sempre por **cidade** (`SAO>RIO`). Filtro por
  aeroporto de origem altera o preço (GRU ≠ CGH), o de destino é ignorado
  (CGH-SDU = CGH-RIO). Comportamento não documentado.
- Catálogo: `data/pt/{airports,cities,countries}.json` — 3.683 aeroportos com
  voo comercial, 9.653 cidades, nomes em português, fuso e coordenadas; grátis,
  sem token.

## Decisão

1. **Fase 1** usa a Travelpayouts Data API como `FlightProvider` real
   (`FLIGHT_PROVIDER=travelpayouts`), lendo `v2/prices/latest`.
2. O dado é tratado como o que ele é: **resumo de tarifa** — o menor preço
   encontrado para uma rota e um dia, com escalas, duração e o instante real em
   que foi encontrado. O domínio ganha essa representação (SPEC-030) em vez de
   inventar trechos (ADR-004: "campos ausentes permanecem ausentes").
3. Busca e monitoramento são **por cidade** (área metropolitana) na Fase 1. A
   precisão por aeroporto fica para a Fase 2.
4. "Todos os voos" na Fase 1 = link de busca da Aviasales montado pelo sistema
   (`/search/{ORIGEM}{DDMM}{DESTINO}{DDMM?}{adultos}`), com o marker de afiliado
   quando configurado. O `link` interno do v3 (itinerário codificado em `t=`) não
   é usado: formato não documentado.
5. O catálogo de lugares vem da mesma fonte e é sincronizado para o banco
   (SPEC-029) — nenhuma lista de aeroportos no código.
6. **Fase 2**, ao atingir 50 mil MAU: Search API em tempo real atrás da mesma
   porta, com lista completa de voos e precisão por aeroporto.

## Consequências

Positivas:

- provider real sem custo por consulta e sem esperar contrato;
- afiliado embutido na fonte (SPEC-020 já suporta o marker por provider);
- frescor medido e exposto (`found_at` vira `observedAt`).

Negativas e riscos:

- não é inventário: rotas pouco procuradas ficam sem dado (estado `no_offers`,
  já tratado de ponta a ponta);
- um preço por dia, sem identificar o voo — o alerta é sobre o **menor preço do
  dia** para a rota;
- vendedores do cache incluem agências pouco conhecidas no Brasil; o link de
  compra leva à busca da Aviasales, onde a pessoa escolhe;
- dependência de um fornecedor; mitigada pela porta `FlightProvider` (ADR-004);
- `found_at` sem fuso explícito na resposta; tratado como UTC (SPEC-030).

## Revisão

Revisar ao chegar a 50 mil MAU (Fase 2) ou se a cobertura medida das rotas mais
monitoradas cair abaixo de 80%.
