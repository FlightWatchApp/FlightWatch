# ADR-007 — Métricas e logs estruturados

Status: aceito para v0.1  
Data: 2026-09-21

## Contexto

Todo spec (SPEC-001 a SPEC-007) tem uma seção "Observabilidade" e `ARCHITECTURE.md` §12 define métricas mínimas e a regra de `correlation_id` — mas nada disso estava implementado: nenhuma biblioteca de métricas instalada, nenhum endpoint `/metrics`/`/health`, nenhum log estruturado, `correlation_id` gerado e persistido (scheduler, jobs, outbox) mas nunca escrito num log de verdade. `QUALITY-GATES.md` G11 bloqueia release por mudança operacional relevante sem métricas/logs/traces dos caminhos novos.

O sistema hoje roda como 5 processos Node separados (`apps/api` + 4 workers/scheduler), sem infraestrutura externa de observabilidade no `docker-compose.yml` (só Postgres/Redis).

## Decisão

- **`prom-client`** para métricas, formato de exposição Prometheus (texto plano em `/metrics`) — sem instalar Prometheus/Grafana no `docker-compose.yml` nesta fase (fora do escopo: é infra de operação/deploy, não código da aplicação; qualquer scraper externo aponta pro endpoint quando existir).
- Cada processo (`apps/api` e cada worker/scheduler) mantém seu **próprio `Registry`** do `prom-client` — sem agregação entre processos nesta fase (nenhum dos workers roda hoje em múltiplas réplicas).
- `apps/api` expõe `/health` na própria porta pública do Fastify (mesmo listener do tráfego real, `0.0.0.0`) — é só `ok`/`unhealthy`, sem detalhe interno, e um balanceador/orquestrador precisa alcançá-lo. `/metrics` (achado de review: estava na mesma porta pública, inconsistente com a postura abaixo) serve numa porta dedicada separada, isolada em `127.0.0.1` por padrão — mesmo tratamento dos workers. Workers/scheduler não têm servidor HTTP hoje — ganham um servidor HTTP mínimo dedicado só pra isso (`node:http` puro, sem framework — não justifica trazer Fastify pra um processo que só consome fila), com `/health` e `/metrics` juntos ali, já que nessa porta isolada não há a mesma exposição.
- Log estruturado: JSON de uma linha por evento, sempre com `correlation_id` quando disponível, nunca com senha/token/e-mail completo/contato pessoal (AGENTS.md §4, §9). Sem biblioteca de logging (pino, winston) nesta fase — `console.log(JSON.stringify(...))` é suficiente pro volume atual e evita mais uma dependência; revisar se/quando log shipping estruturado for necessário.
- O servidor dedicado de métricas faz bind em `127.0.0.1` por padrão; `METRICS_HOST=0.0.0.0` só deve ser usado quando o scraper estiver numa rede interna confiável e isolada.
- Nomes de métrica literais já definidos em SPEC-001/002/004/007 são usados exatamente como especificado. SPEC-003/005/006 só descrevem os sinais em prosa — esta ADR e as specs atualizadas junto dela fixam os nomes concretos (ver cada spec §Observabilidade após esta mudança).

## Motivos

- `prom-client` é a biblioteca padrão de fato pro ecossistema Node/NestJS — zero lock-in exótico, formato de exposição universal (qualquer scraper Prometheus-compatível funciona sem mudança de código).
- Servidor HTTP mínimo nos workers evita a alternativa pior (nenhuma visibilidade em processos que hoje só têm `console.log`/`console.error` sem estrutura, e nenhuma forma de saber se estão vivos sem olhar log).
- JSON simples via `console.log` é suficiente porque nada agrega logs centralizadamente ainda — introduzir uma lib de logging estruturado sem um coletor do outro lado seria complexidade sem benefício imediato.

## Consequências positivas

- G11 deixa de estar bloqueado por ausência total de instrumentação;
- `correlation_id` finalmente rastreável de ponta a ponta em log, não só no banco;
- endpoint `/health` em cada processo dá um sinal real de vida, hoje inexistente.

## Consequências negativas

- sem agregação entre processos, métricas de uma réplica não somam com outra automaticamente — aceitável enquanto não há múltiplas réplicas de nenhum worker;
- `console.log` estruturado ainda exige um coletor externo (não incluído aqui) pra virar buscável/alertável de verdade — métricas via `/metrics` são o sinal operacional imediato, logs ficam como evidência auditável local até então;
- servidor HTTP mínimo nos workers é mais uma porta exposta por processo — mitigado por não expor fora do host/rede interna por padrão (mesma postura de Postgres/Redis no `docker-compose.yml`).

## Alternativas rejeitadas

### OpenTelemetry desde já

Rejeitado por escopo: exigiria escolher e operar um collector, decidir exportador (traces/metrics/logs), e o volume atual não justifica a complexidade. `next@16.3.5` já declara `@opentelemetry/api` como peer dependency opcional — revisar quando o frontend precisar de tracing correlacionado com o backend.

### Logging estruturado com pino/winston

Rejeitado nesta fase pelo mesmo motivo do OpenTelemetry: sem coletor central, a biblioteca só adicionaria overhead de dependência sem ganho sobre `console.log(JSON.stringify(...))`.

## Gatilhos para revisão

- necessidade real de múltiplas réplicas de um worker (métricas por-processo deixam de ser suficientes, precisa de agregação/labels de instância);
- introdução de um coletor de logs central (justifica reavaliar pino/winston);
- necessidade de tracing distribuído correlacionando frontend e backend (justifica OpenTelemetry).
