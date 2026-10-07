# OBSERVABILITY CODE REVIEW

## 1. Executive Summary

Foi realizada uma revisão adversarial dos arquivos staged, unstaged e untracked relacionados à feature de observability, incluindo API, `packages/observability`, scheduler, price-worker, alert-worker, notification-worker, database, testes e documentação.

O núcleo da implementação está consistente e os fluxos principais passaram nos testes. Foram corrigidos problemas de sanitização, lifecycle do servidor HTTP, semântica de métricas, circuit breaker e replay idempotente.

A feature ainda não deve ser aprovada para produção.

## 2. Findings

### [HIGH] Endpoint `/metrics` da API potencialmente público

- Arquivos: [health.controller.ts](/home/lucasb/projetoPassagens/apps/api/src/observability/health.controller.ts:24), [main.ts](/home/lucasb/projetoPassagens/apps/api/src/main.ts:9)
- Problema: a API escuta em `0.0.0.0` e expõe `/metrics` sem autenticação, allowlist ou proteção de rede.
- Impacto: exposição de informações operacionais e possibilidade de abuso do endpoint.
- Correção aplicada: workers passaram a usar `127.0.0.1` por padrão e `METRICS_HOST` configurável.
- Situação: a API ainda precisa de proteção no deployment ou endpoint privado separado.

### [MEDIUM] Semântica de `/health` está misturada

- Arquivos: [health.controller.ts](/home/lucasb/projetoPassagens/apps/api/src/observability/health.controller.ts:14), [alert-worker/main.ts](/home/lucasb/projetoPassagens/apps/alert-worker/src/main.ts:16)
- Problema: a API executa `SELECT 1`, representando readiness, enquanto os workers retornam saudável sempre, representando apenas liveness.
- Risco adicional: o `SELECT 1` não possui timeout explícito.
- Impacto: health checks podem gerar falsos positivos/negativos ou ficar pendurados sob degradação do banco.
- Correção aplicada: nenhuma; é necessária uma decisão operacional entre endpoints `/live` e `/ready`.

### [MEDIUM] Métricas declaradas nas specs ainda não estão completas

As specs exigem sinais adicionais que não estão implementados:

- latência e target criado/reutilizado em Watch;
- idade p95/p99 de atraso;
- leases expiradas/reconciliadas;
- algumas métricas operacionais de alertas e notificações.

Referências: [SPEC-001](/home/lucasb/projetoPassagens/flight-watch-foundation-v0.1/docs/specs/SPEC-001-create-watch.md:169), [SPEC-002](/home/lucasb/projetoPassagens/flight-watch-foundation-v0.1/docs/specs/SPEC-002-schedule-price-check.md:120).

Impacto: o gate G11 ainda não está completamente atendido.

### [MEDIUM — corrigido] Lifecycle e falhas do servidor de métricas

- Arquivo: [metrics-server.ts](/home/lucasb/projetoPassagens/packages/observability/src/metrics-server.ts:18)
- Correções:
  - `startMetricsServer` agora aguarda o evento `listening`;
  - falha de bind rejeita o startup;
  - erros de `/metrics` não expõem detalhes internos;
  - `/health` trata exceções;
  - bind padrão mudou para `127.0.0.1`;
  - workers usam `METRICS_HOST`;
  - startup e shutdown foram ajustados.

Os testes HTTP do pacote passaram: 17 testes.

### [MEDIUM — corrigido] Logger não sanitizava estruturas aninhadas e Errors

- Arquivo: [logger.ts](/home/lucasb/projetoPassagens/packages/observability/src/logger.ts:51)
- Problemas corrigidos:
  - objetos aninhados;
  - arrays;
  - `Error.message` e stack;
  - referências circulares;
  - `BigInt`;
  - casing e separadores em nomes sensíveis;
  - timestamp falsificado pelo chamador.

Ainda existe o risco residual normal de qualquer denylist não cobrir novos campos sensíveis desconhecidos.

### [LOW — parcialmente corrigido] Nome `scheduler_targets_scanned_total`

- Arquivo: [tick.ts](/home/lucasb/projetoPassagens/apps/scheduler/src/tick.ts:27)
- Evidência: o valor continua sendo `eligible.length`, ou seja, targets selecionados, não necessariamente todas as linhas fisicamente examinadas.
- Correção aplicada: help e comentários agora documentam “selecionados”.
- Recomendação: renomear em uma futura versão para evitar ambiguidade externa.

### [LOW — fora da feature] Build global do frontend continua falhando

- Comando: `next build`
- Resultado: a compilação passa, mas o Next falha em `Could not parse output from TypeScript's --showConfig`.
- O `tsc` direto do frontend passa.
- Esse problema não foi introduzido pela observability, mas impede o quality gate global.

## 3. Breaking Change Audit

Função analisada:

[persistPriceObservationSuccess](/home/lucasb/projetoPassagens/packages/database/src/price-observation-repository.ts:118)

Call sites encontrados:

- 1 consumidor de produção:
  - [price-worker/process-job.ts](/home/lucasb/projetoPassagens/apps/price-worker/src/process-job.ts:212)
- 4 invocações em testes:
  - `packages/database/src/scheduler-and-pricing.integration.test.ts`

Não foi encontrado terceiro consumidor esquecido, alias oculto, mock incompatível ou script executável dependente do retorno anterior.

A alteração para `{ observation, created }` está correta. A idempotência foi validada com testes de integração.

Também foi corrigido o caso em que um job redeliverado após `SUCCEEDED` retornava antes de contabilizar `idempotent_replay`:

- [scheduler-repository.ts](/home/lucasb/projetoPassagens/packages/database/src/scheduler-repository.ts:82)
- [process-job.ts](/home/lucasb/projetoPassagens/apps/price-worker/src/process-job.ts:67)
- [process-job.test.ts](/home/lucasb/projetoPassagens/apps/price-worker/src/process-job.test.ts:242)

## 4. Metrics Semantics Audit

| Métrica                           | Tipo      | Labels               | Semântica                                   | Risco                           |
| --------------------------------- | --------- | -------------------- | ------------------------------------------- | ------------------------------- |
| `watch_create_total`              | Counter   | `result`             | Tentativas de criação de Watch              | Labels controlados              |
| `auth_register_total`             | Counter   | `result`             | Tentativas de registro                      | Labels controlados              |
| `auth_login_total`                | Counter   | `result`             | Tentativas de login                         | Labels controlados              |
| `scheduler_targets_scanned_total` | Counter   | nenhum               | Targets selecionados                        | Nome ambíguo                    |
| `scheduler_jobs_created_total`    | Counter   | `result`, `reason`   | Jobs realmente criados                      | Atualmente só sucesso           |
| `scheduler_tick_errors_total`     | Counter   | `reason`             | Falhas do tick                              | Controlado                      |
| `scheduler_targets_delayed`       | Gauge     | `priority`           | Targets atrasados                           | Prioridade normalizada          |
| `provider_call_total`             | Counter   | `provider`, `result` | Chamadas/tentativas ao provider             | Classes finitas                 |
| `provider_call_duration_seconds`  | Histogram | `provider`           | Latência externa                            | Timer encerrado em sucesso/erro |
| `offers_received_total`           | Counter   | nenhum               | Ofertas recebidas                           | Correto                         |
| `offers_eligible_total`           | Counter   | nenhum               | Ofertas elegíveis                           | Reutiliza regra de domínio      |
| `circuit_breaker_open`            | Gauge     | `provider`           | Estado atual do circuit breaker             | Corrigido                       |
| `price_observation_total`         | Counter   | `result`             | `success`, `no_offers`, `idempotent_replay` | Corrigido                       |

Não foram encontrados labels com usuário, e-mail, rota, URL, token ou mensagem de erro arbitrária.

## 5. Security / Privacy Audit

- Logs agora possuem sanitização recursiva e tratamento seguro de `Error`.
- E-mails, tokens, cookies, authorization, destinos e campos equivalentes são redigidos.
- Métricas não usam PII nem IDs de alta cardinalidade.
- O endpoint da API continua sem proteção própria e deve ser isolado por rede, proxy ou autenticação.
- Workers agora escutam localmente por padrão; `METRICS_HOST=0.0.0.0` deve ser usado somente em rede interna confiável.

## 6. Business Logic Regression Audit

- `WatchesService.createWatch`: mantém o mesmo retorno e relança exatamente o mesmo erro.
- `AuthService.register/login`: métricas incrementam uma única vez por tentativa.
- Scheduler: criação, reconciliação, retries e expiração permaneceram funcionais.
- Price-worker: timer, provider, rate limiter e circuit breaker continuam funcionando.
- `persistPriceObservationSuccess`: idempotência preservada.
- Nenhuma chamada de métrica ou log altera transação de negócio.
- Alert-worker e notification-worker mantiveram seus fluxos; receberam apenas observabilidade e lifecycle HTTP.

## 7. Test Evidence

Passaram:

- `17` testes de `packages/observability`;
- `38` testes e2e da API;
- `6` testes do scheduler;
- `11` testes do price-worker;
- `10` testes do alert-worker;
- `8` testes do notification-worker;
- `19` testes de integração do database.

Também passaram:

- builds dos processos alterados;
- typecheck da API, scheduler, price-worker, database e observability;
- `eslint apps packages --max-warnings=0`;
- Prettier;
- `git diff --check`.

Falha restante:

```text
apps/web: next build
Could not parse output from TypeScript's --showConfig.
```

O sandbox inicialmente bloqueou sockets HTTP e Docker; as suítes foram repetidas com acesso autorizado e passaram.

## 8. Changes Made During Review

- Sanitização recursiva e robusta do logger.
- Proteção contra timestamp sobrescrito.
- Tratamento seguro de Errors, BigInt e referências circulares.
- Metrics server assíncrono, com erro de bind propagado.
- Bind local padrão e `METRICS_HOST` configurável.
- Startup e shutdown dos workers revisados.
- Métricas do scheduler corrigidas e labels de prioridade limitados.
- Erros de tick separados de falhas de criação de jobs.
- Gauge do circuit breaker corrigido.
- Métrica `no_offers` movida para depois da persistência.
- Métrica de replay idempotente corrigida para redelivery terminal.
- Dependências de observability adicionadas aos workers faltantes.
- Testes adicionados para logger, server e replay.

## 9. Remaining Recommendations

- Separar `/live` e `/ready`, com timeout explícito para dependências.
- Proteger `/metrics` da API via rede privada ou autenticação.
- Implementar as métricas restantes das SPEC-001 e SPEC-002.
- Adicionar alertas e runbooks correspondentes ao G11.
- Corrigir o `next build` do frontend.
- Padronizar `correlationId` versus `correlation_id`.

## 10. FINAL QUALITY GATE

FAIL

O núcleo da feature está correto e os testes relevantes passam, mas o gate falha por:

1. `/metrics` da API sem proteção;
2. semântica incompleta de health/readiness;
3. métricas exigidas pelas specs ainda ausentes;
4. build global do frontend quebrado.
