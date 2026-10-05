# Backlog de próximas specs

> Numeração alinhada com a sequência canônica de
> `flight-watch-foundation-v0.1/docs/specs/` — SPEC-014 é o próximo número
> livre depois da Fase 0 (Reliability Hardening: SPEC-011/012/013). Os
> rascunhos completos ficam em `specs/`; quando uma spec é aprovada e entra em
> implementação, ela migra para `flight-watch-foundation-v0.1/docs/specs/` e
> este backlog passa a apontar para lá em vez de manter duas fontes.

## SPEC-014 — Busca de passagens e oferta normalizada

**Status: implementada (fatia síncrona)** — ver
`flight-watch-foundation-v0.1/docs/specs/SPEC-014-flight-discovery.md`.

A fatia implementada cobre busca **síncrona** (sem fila/polling — só o
`SimulatedFlightProvider` existe, e é in-process/instantâneo), destino IATA
concreto (não `ANYWHERE`), rate limit público real (`@nestjs/throttler`),
oferta com preço/moeda/trechos/duração/escalas/deep link, e derivação de
Watch a partir de uma oferta com `currentOffer` populado imediatamente (sem
esperar o scheduler). **Continuam pendentes do rascunho original**: busca
assíncrona com polling (só faz sentido quando um provider real e lento
existir — hoje `BLOQUEADO`, contrato Duffel), `ANYWHERE` (depende do
catálogo de `Destination`, SPEC-016), resposta parcial de verdade
(`FlightSearchStatus.PARTIAL` existe no schema mas nenhum código o produz
ainda).

Critérios mínimos originais (para referência — ver a spec canônica para os
critérios de aceitação reais da fatia implementada):

- busca autenticada ou pública com rate limit;
- resposta parcial e estados de erro distintos;
- oferta com preço total, moeda, trechos, duração e escalas;
- oferta expirada não aparece como comprável;
- provider simulado e contrato de provider real;
- criação de Watch preserva os critérios da oferta.

## SPEC-015 — Promoções e feed de oportunidades

**Status: implementada** — ver
`flight-watch-foundation-v0.1/docs/specs/SPEC-015-opportunities.md`.

`Deal` é computado em leitura (nunca persistido), com dois tipos shipados
(`HISTORICAL_LOW`, `PERCENTAGE_BELOW_REFERENCE`); `FLASH_WINDOW` e
`PACKAGE_VALUE` ficaram de fora (limiares de produto não aprovados /
dependência de SPEC-017). O feed só enxerga rotas que alguém já monitora —
não existe crawler de fundo descobrindo rotas populares; ver a spec
canônica para o raciocínio completo. "Monitorar" reusa `POST /v1/watches`
existente, sem endpoint novo.

Critérios mínimos originais (para referência):

- toda promoção tem fórmula/referência auditável;
- preço antigo e preço atual são distintos;
- feed filtra por frescor e região;
- usuário pode abrir, salvar ou monitorar;
- nenhuma promoção promete menor preço absoluto do mercado.

## SPEC-016 — Exploração no mapa

**Status: implementada (fatia sem catálogo de Destination)** — ver
`flight-watch-foundation-v0.1/docs/specs/SPEC-016-opportunity-map.md`.

Toggle Lista/Mapa em `/opportunities`, OpenStreetMap + Leaflet (aprovado
pelo usuário, sem custo/API key), com uma tabela fixa provisória de
coordenadas para os 7 aeroportos já suportados (não um catálogo real de
`Destination`). Mapa é `aria-hidden` deliberadamente — a lista é a via
primária e completa; navegação por teclado nos marcadores foi cortada por
risco de engenharia vs. benefício, já que a lista cobre o mesmo caminho.
Sem clustering (no máximo 7 marcadores nesta fatia).

Critérios mínimos originais (para referência):

- lista continua funcional sem JavaScript/mapa;
- filtros são compartilhados entre modos;
- seleção no mapa destaca item da lista;
- o mapa não expõe PII nem rotas inventadas;
- tiles, geocoding e licenças são documentados.

## SPEC-017 — Pacotes de viagem

**Status: adiada** — sem fonte autorizada de hospedagem/preço componível
(mesmo tipo de bloqueio do provider de voo real, CLAUDE.md §1.3). O
usuário confirmou pular esta spec até existir uma decisão de fonte de
dados. Sem rascunho canônico escrito ainda.

Define composição de voo, hospedagem e outros componentes.

Critérios mínimos:

- cada componente tem fonte, preço, moeda e validade;
- total é explicável;
- regras de cancelamento ficam explícitas quando conhecidas;
- pacote expirado não é tratado como disponível;
- compra acontece fora do Flight Watch nesta fase.

## SPEC-018 — Compra a partir do monitoramento

**Status: implementada** — ver
`flight-watch-foundation-v0.1/docs/specs/SPEC-018-watch-purchase-link.md`.

Define como o último preço observado de um Watch leva o usuário ao canal de
compra correspondente. Não dependia de SPEC-014 existir tecnicamente — o dado
(`PriceObservation.deeplink`) já existia; o gap era só de projeção, contrato e
frontend, por isso virou a primeira fatia implementada da Fase 1, antes da
busca completa.

## SPEC-019 — Catálogo, preferências e recomendações explicáveis

Define catálogo de aeroportos, aliases e preferências explícitas. Recomendações
não devem depender de perfil inferido silenciosamente.

Critérios mínimos:

- catálogo não fica hardcoded no frontend;
- geodados possuem fonte e licença documentadas;
- usuário controla origem, faixa, datas e interesses;
- recomendação mostra o motivo;
- recomendação não altera regras de alerta sem consentimento;
- opt-out e exclusão são simples.

## SPEC-020 — Link de compra com rastreio de afiliado

**Status: implementada** — ver
`flight-watch-foundation-v0.1/docs/specs/SPEC-020-affiliate-purchase-links.md`
("Evidência de implementação").

Acrescenta parâmetros de rastreio de afiliado ao `purchaseUrl` já produzido
pela allowlist de SPEC-018, nas três superfícies de compra (`WATCH`, `SEARCH`
via SPEC-014, `OPPORTUNITY` via SPEC-015). Não muda preço, ordem ou
elegibilidade de nada que a pessoa vê; exige aviso de comissão e
`/transparencia` na interface. Conduzida pelo backlog de tarefas A1–A3 em
`docs/design-refactor/08-backlog.md`.

## SPEC-021 — Experiência web v2: identidade visual, promoções em destaque e transparência

**Status: implementada** (AC-006, rubrica visual assinada pelo owner,
pendente — ver Z2 em `docs/design-refactor/08-backlog.md`) — ver
`flight-watch-foundation-v0.1/docs/specs/SPEC-021-web-experience-v2.md`
("Evidência de implementação").

Nova identidade visual, promoções em destaque na home/painel/página dedicada e
animações com significado, sem mudar nenhum contrato de API nem o critério de
promoção de SPEC-015. Detalhada em `docs/design-refactor/01`–`03`-spec-*.md`e conduzida pelo backlog de tarefas V1–V5/P1–P7/Z1–Z2 em`docs/design-refactor/08-backlog.md`.

## Ordem de escrita

1. ~~finalizar SPEC-010 e confirmar que o canal de alerta é utilizável~~ — feito;
2. ~~fechar SPEC-011/012/013 (Fase 0 — Reliability Hardening)~~ — feito;
3. ~~implementar SPEC-018 junto da projeção de Watch/oferta~~ — feito, adiantada
   por não depender tecnicamente da busca completa;
4. ~~implementar SPEC-014 (fatia síncrona)~~ — feito; busca assíncrona/
   `ANYWHERE` continuam bloqueadas por provider real/catálogo de Destination;
5. ~~implementar SPEC-015 (feed de oportunidades)~~ — feito; `FLASH_WINDOW`/
   `PACKAGE_VALUE` adiados (limiares de produto/dependência de SPEC-017);
6. ~~implementar SPEC-016 (toggle Lista/Mapa)~~ — feito, com tabela fixa
   provisória de 7 aeroportos em vez de um catálogo real de `Destination`;
7. SPEC-017 adiada indefinidamente — sem fonte autorizada de hospedagem;
   retomar só quando essa decisão de produto existir;
8. escrever SPEC-019 depois da validação de uso e do catálogo.
