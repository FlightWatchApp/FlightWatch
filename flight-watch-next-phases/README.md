# Flight Watch — planejamento das próximas fases

Este diretório transforma o Flight Watch de uma base de monitoramento em uma
plataforma de descoberta, comparação e monitoramento de viagens.

A referência visual e de exploração é o FlightConnections, mas o produto não
deve copiar sua marca, layout, textos, assets ou modelo de negócio. A referência
é usada para estudar padrões: mapa como superfície de exploração, filtros
progressivos, alternância entre mapa e lista, navegação por aeroportos/rotas e
densidade de informação controlada.

## Como ler

1. `00-current-state-and-gaps.md` — onde o projeto está e o que não deve ser
   ignorado antes de crescer.
2. `01-reference-analysis-flightconnections.md` — análise da referência e o
   que será absorvido, adaptado ou rejeitado.
3. `02-product-vision-and-information-architecture.md` — produto desejado,
   públicos e arquitetura de navegação.
4. `03-visual-and-ux-direction.md` — direção visual própria, wireframes e
   regras de experiência.
5. `04-domain-and-platform-evolution.md` — entidades, limites e arquitetura
   técnica para ofertas, promoções, pacotes e Watches.
6. `05-roadmap.md` — execução por fases, com entregas pequenas e verificáveis.
7. `06-spec-backlog.md` — índice das próximas specs e dependências.
8. `specs/` — rascunhos prontos para virar implementação. A numeração começa
   em SPEC-014: a Fase 0 (Reliability Hardening) ocupou SPEC-011/012/013 na
   sequência canônica antes desta pasta ser desenvolvida — os rascunhos foram
   renumerados de 011-015 para 014-018 para não colidir. Quando uma spec daqui
   entra em implementação, ela migra para
   `flight-watch-foundation-v0.1/docs/specs/`; `06-spec-backlog.md` registra
   o status de cada uma.

## Decisão central

O sistema terá quatro superfícies relacionadas, mas não misturadas:

```text
Descobrir      → encontrar ofertas e destinos
Comparar       → entender opções, preço, duração e conexões
Monitorar      → acompanhar uma intenção específica ao longo do tempo
Comprar        → encaminhar para o canal autorizado de emissão/reserva
```

`Watch` continua sendo o objeto de acompanhamento. Uma oferta descoberta é um
snapshot com validade própria; ela não deve ser confundida com um preço
histórico do Watch.

## Ordem recomendada

Antes de construir mapa ou pacotes, corrigir os findings da revisão de
SPEC-008/009, fechar a escolha de provedor e criar um contrato de oferta. O
mapa só deve ser conectado a dados reais depois que a busca/lista funcionar sem
ele.

## Não objetivos desta pasta

- clonar o FlightConnections;
- prometer cobertura mundial antes de ter fonte licenciada;
- fazer scraping sem autorização;
- criar marketplace ou checkout próprio nesta etapa;
- colocar inteligência artificial no caminho determinístico de preço/alerta;
- substituir o núcleo de monitoramento já implementado.
