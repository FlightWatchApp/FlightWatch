# Roadmap de execução

## Fase 0 — estabilização da fundação

Objetivo: tornar SPEC-008/009 confiáveis antes de aumentar a superfície.

Entregas:

- correlação HTTP e logs estruturados;
- labels de métricas corrigidos;
- atualização da rota de detalhe após lifecycle;
- e2e de estados terminais, 500 pontos e métricas;
- redução/medição do fan-out do Watch;
- fencing de SearchExecution e recuperação de `SENDING`;
- runbook de observabilidade e dados expirados.

Saída: gates G1–G11 aplicáveis verdes para a fundação.

## Fase 1 — contrato de oferta e busca simulada

Objetivo: criar uma experiência real de descoberta sem depender ainda de um
provedor externo em produção.

Entregas:

- `FlightSearch`, `FlightOffer`, frescor e fonte;
- provider simulado determinístico com fixtures;
- `POST/GET` de busca assíncrona;
- tela pública de busca + lista responsiva;
- detalhes da oferta;
- projeção `currentOffer` no Watch com `purchaseUrl`, preço, fonte, observação e
  validade;
- CTA `Comprar passagem` no card da listagem e na tela de detalhe;
- estado explícito para link ausente ou preço expirado;
- ação “monitorar esta oferta” derivando a intenção do Watch;
- testes de contrato e e2e com dados sintéticos.

Saída: usuário consegue buscar, comparar e criar um Watch sem conhecer o
formulário interno atual.

## Fase 2 — catálogo de aeroportos e busca flexível

Objetivo: sair da lista hardcoded e permitir exploração por geografia.

Entregas:

- catálogo versionado de aeroportos/destinos;
- autocomplete por código, cidade e país;
- `ANYWHERE` por origem;
- janela de datas e modo fim de semana/férias;
- filtros de escalas, duração, companhia e orçamento;
- páginas de destino e aeroporto com dados sintéticos/licenciados.

Saída: buscas reais por intenção incompleta, sem obrigar o usuário a saber o
IATA do destino.

## Fase 3 — oportunidades e promoções

Objetivo: responder “quais passagens valem atenção agora?”.

Entregas:

- `Deal` e regras de classificação;
- feed de oportunidades por região, origem e orçamento;
- explicação do motivo de cada promoção;
- filtro de validade/frescor;
- salvar e monitorar oportunidade;
- notificações opcionais de novas promoções.

Saída: home útil mesmo sem Watches.

## Fase 4 — mapa de oportunidades

Objetivo: introduzir exploração geográfica como segunda visualização da busca.

Entregas:

- spike de tecnologia de mapa e licença de tiles;
- geodados de aeroportos e destinos;
- `OpportunityMap` com fallback em lista;
- sincronização mapa/lista;
- clustering, seleção e acessibilidade;
- métricas de interação e custo de tiles.

Saída: mapa ajuda a descobrir destinos, não apenas mostra linhas.

## Fase 5 — pacotes

Objetivo: testar combinações de voo e hospedagem com transparência.

Entregas:

- contrato `PackageOffer`;
- primeiro fornecedor ou fixtures compostas;
- breakdown por componente;
- validade e deep links;
- comparação com comprar componentes separadamente;
- monitoramento de preço de pacote somente após semântica estar clara.

Saída: pacote não é uma soma enganosa nem um checkout incompleto.

## Fase 6 — provedor real e piloto

Objetivo: conectar uma fonte autorizada e validar custo/qualidade.

Entregas:

- ADR de provedor;
- contract tests com sandbox;
- quotas, rate limits, circuit breaker e custos;
- staging com dados sintéticos e pequena cota real;
- métricas de cobertura, frescor, clique e conversão;
- rollout gradual.

## Ordem de implementação recomendada

```text
Fase 0 → Fase 1 → Fase 2 → Fase 3
                      ├── Fase 4
                      └── Fase 5
Fase 6 após provider/compliance e evidência de custo
```

Não começar pelo mapa. Começar por uma lista de ofertas que seja útil e
testável sem depender de visualização complexa.
