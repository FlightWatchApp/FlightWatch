# EVALS — Estratégia de avaliação

Versão: 0.1  
Status: baseline antes da implementação

## 1. Objetivo

Evals verificam se o sistema preserva comportamento, custo, resiliência, segurança e operabilidade. Eles complementam testes tradicionais: transformam riscos centrais do produto em cenários mensuráveis e repetíveis.

O resultado deve ser determinístico sempre que a regra também for determinística. Evals probabilísticos somente serão admitidos em funcionalidades futuras de IA, com dataset e limiar próprios.

## 2. Estrutura de um eval

Cada cenário contém:

```yaml
id: EVAL-AREA-NNN
version: 1
purpose: texto curto
given: estado e entradas
when: ação
then: resultados observáveis
metrics: valores capturados
threshold: condição de aprovação
fixtures: referências sanitizadas
owner: módulo responsável
```

Datas e relógio devem ser injetáveis. IDs aleatórios devem ser controláveis. Nenhum eval chama produção ou consome cota real, salvo suíte smoke explicitamente isolada.

## 3. Dataset e fixtures

```text
evals/
├── fixtures/
│   ├── providers/
│   │   ├── normal-one-way.json
│   │   ├── normal-round-trip.json
│   │   ├── multiple-offers.json
│   │   ├── no-offers.json
│   │   ├── malformed.json
│   │   ├── rate-limit.json
│   │   └── timeout.json
│   └── notifications/
├── scenarios/
│   ├── deduplication/
│   ├── pricing/
│   ├── alerting/
│   ├── resilience/
│   ├── security/
│   └── performance/
└── runner/
```

Fixtures capturadas de provedores devem ser sanitizadas, licenciadas para uso interno, versionadas e acompanhadas do schema/adaptador correspondente.

## 4. Evals obrigatórios v0.1

### Deduplicação

#### EVAL-DEDUP-001 — Watches equivalentes

**Dado:** 100 usuários criam Watch para DOU → GRU, ida em 20/12/2026, econômica, 1 adulto, BRL, mercado BR.  
**Quando:** as requisições são processadas, inclusive em concorrência.  
**Esperado:** 100 Watches, 100 vínculos e exatamente 1 SearchTarget.

Threshold: aprovação integral e ausência de erro de unicidade exposto ao usuário.

#### EVAL-DEDUP-002 — Diferença material

**Dado:** duas pesquisas iguais, exceto pela data de ida.  
**Esperado:** 2 SearchTargets com fingerprints diferentes.

#### EVAL-DEDUP-003 — Normalização

**Dado:** códigos em casing/espaçamento diferentes e defaults semanticamente iguais.  
**Esperado:** mesma chave canônica e mesmo target.

#### EVAL-DEDUP-004 — Versão de schema

**Dado:** mesmos campos em `schema=v1` e `schema=v2`.  
**Esperado:** fingerprints diferentes e migração explicitamente controlada.

### Normalização e preço

#### EVAL-PRICE-001 — Menor oferta elegível

Ofertas válidas de R$ 1.250,00, R$ 970,00 e R$ 1.040,00.  
Esperado: observação de `97000 BRL`, associada à política de seleção vigente.

#### EVAL-PRICE-002 — Unidade monetária

Entrada `970.10 BRL`.  
Esperado: `97010`, sem ponto flutuante persistido.

#### EVAL-PRICE-003 — Sem ofertas

Resposta válida com lista vazia.  
Esperado: execução `no_offers`, zero novas PriceObservations e preservação do último preço.

#### EVAL-PRICE-004 — Resposta malformada

Resposta sem moeda ou total.  
Esperado: falha classificada, nenhuma observação e fixture identificada na telemetria sem payload sensível.

#### EVAL-PRICE-005 — Moedas distintas

Referência em BRL e observação em USD.  
Esperado: nenhuma comparação ou alerta; erro/flag de incompatibilidade observável.

#### EVAL-PRICE-006 — Empate estável

Duas ofertas com mesmo total e itinerários diferentes.  
Esperado: mesma oferta selecionada em execuções repetidas, conforme desempate versionado.

### Alertas

#### EVAL-ALERT-001 — Queda percentual atendida

Referência R$ 1.000,00; atual R$ 800,00; limiar 15%.  
Esperado: `trigger=true`, queda calculada em 20% e justificativa persistida.

#### EVAL-ALERT-002 — Queda percentual não atendida

Referência R$ 1.000,00; atual R$ 930,00; limiar 15%.  
Esperado: `trigger=false`.

#### EVAL-ALERT-003 — Preço-alvo inclusivo

Alvo R$ 800,00; atual R$ 800,00.  
Esperado: `trigger=true`.

#### EVAL-ALERT-004 — Queda absoluta

Referência R$ 1.200,00; atual R$ 990,00; limiar R$ 200,00.  
Esperado: `trigger=true`, queda R$ 210,00.

#### EVAL-ALERT-005 — Watch pausado

Regra seria atendida, mas Watch está pausado.  
Esperado: nenhum AlertEvent entregável.

#### EVAL-ALERT-006 — Cooldown

Dois eventos elegíveis no intervalo menor que o cooldown.  
Esperado: primeiro enfileirado, segundo suprimido com motivo auditável.

#### EVAL-ALERT-007 — Novo menor observado

Histórico do Watch: 100000, 95000, 98000; atual 94000.  
Esperado: trigger de novo menor. Para atual 96000, não dispara.

### Idempotência

#### EVAL-IDEMPOTENCY-001 — AlertEvent repetido

Mesmo evento processado três vezes.  
Esperado: 1 AlertEvent e no máximo 1 entrega por canal.

#### EVAL-IDEMPOTENCY-002 — Job de preço repetido

Mesmo job executado após timeout de confirmação.  
Esperado: nenhuma observação lógica duplicada e estado final consistente.

#### EVAL-IDEMPOTENCY-003 — Outbox republicada

Publisher envia e falha antes de marcar como publicado.  
Esperado: republicação não duplica efeito no consumidor.

### Provedor e resiliência

#### EVAL-PROVIDER-001 — Rate limit

Provider responde 429 com `Retry-After`.  
Esperado: execução `rate_limited`, retry não ocorre antes do período, cota não é martelada.

#### EVAL-PROVIDER-002 — Timeout

Chamada excede timeout.  
Esperado: cancelamento, falha temporária, backoff com jitter e preservação do preço anterior.

#### EVAL-PROVIDER-003 — Autenticação inválida

Provider responde erro de credencial.  
Esperado: falha não retentável, circuit breaker/alerta operacional e nenhuma exposição do segredo.

#### EVAL-PROVIDER-004 — Recuperação

Duas falhas temporárias seguidas de sucesso.  
Esperado: uma observação válida, tentativas registradas e target reagendado normalmente.

#### EVAL-QUEUE-001 — Perda do Redis

Redis reinicia após o estado de domínio ter sido confirmado.  
Esperado: reconciliação/outbox recria trabalho pendente sem perder Watch ou duplicar alerta.

### Segurança e autorização

#### EVAL-SEC-001 — Acesso cruzado

Usuário A tenta ler, pausar ou excluir Watch de B.  
Esperado: resposta não autorizada/indistinguível conforme política e nenhuma alteração.

#### EVAL-SEC-002 — Entrada inválida

Datas impossíveis, origem igual ao destino, moeda não suportada e payload excedente.  
Esperado: rejeição 4xx estruturada e nenhuma escrita parcial.

#### EVAL-SEC-003 — Segredos e PII em logs

Executar fluxos de sucesso e erro com marcadores-canário.  
Esperado: zero ocorrência de token, senha, e-mail completo ou payload bruto nos logs.

#### EVAL-SEC-004 — Rate limit de criação

Rajada acima da quota por usuário/IP.  
Esperado: limitação previsível sem criar recursos extras.

### Notificações

#### EVAL-NOTIFY-001 — Entrega normal

Canal verificado e alerta válido.  
Esperado: template correto, uma entrega e registro do identificador externo.

#### EVAL-NOTIFY-002 — Falha temporária

Canal retorna erro temporário.  
Esperado: retry limitado e posterior sucesso sem mensagem duplicada.

#### EVAL-NOTIFY-003 — Destino inválido

Canal retorna falha permanente.  
Esperado: sem retry infinito, estado permanente e ação de produto/suporte observável.

#### EVAL-NOTIFY-004 — Canal não verificado

Esperado: entrega suprimida; AlertEvent permanece auditável.

### Performance e custo

#### EVAL-PERF-001 — Criação concorrente

1.000 criações, sendo 80% equivalentes.  
Esperado: taxa de erro interna zero, unicidade preservada e p95 definido após baseline.

#### EVAL-PERF-002 — Fan-out de avaliação de alerta

1 SearchTarget ligado a um número alto de Watches com regras simples.
Esperado: processamento paginado, memória limitada e nenhuma duplicação.

**Status (Fase — Reliability Hardening, executado em 2026-09-21):**
`evaluatePriceObservedJob` (`apps/alert-worker/src/evaluate.ts`) já
implementava paginação por cursor (`selectActiveWatchesPage`,
`PAGE_SIZE=200`) desde SPEC-005, mas este eval nunca tinha rodado com números
reais. Primeira execução encontrou um problema genuíno: 29,4s para 100.000
Watches num único `SearchTarget` — a paginação por cursor existia, mas o
índice `[searchTargetId, status]` não cobria `id` (o campo do cursor),
degradando cada página seguinte. Corrigido estendendo o índice para
`[searchTargetId, status, id]` (migração
`20260921194620_watch_fan_out_pagination_index`) — sem reescrever a lógica de
paginação, que já estava certa. Depois da correção: 6,2s para 100.000
Watches (~4,8x mais rápido), dentro do SLO de 60s de `ARCHITECTURE.md` §13.
Metodologia completa e números por N em
`packages/database/src/__benchmarks__/fan-out-benchmark.ts` (rodar de novo
com `pnpm --filter @flight-watch/database bench`).

#### EVAL-PERF-004 — Listagem de Watches (N+1)

**Dado:** um usuário com N Watches (`GET /v1/watches`, `listWatchesForUser`,
achado F-004 de `WATCH-LIFECYCLE-HISTORY-CODE-REVIEW.md` — 3 consultas extras
por Watch, sem paginação).
**Quando:** N = 1, 20 (limite atual de `MAX_ACTIVE_WATCHES_PER_USER`), 100 e
500 (acima do limite, para enxergar a curva antes que o produto precise
mudar o limite).
**Esperado:** p95 documentado por N; decisão explícita — dentro do orçamento
do MVP, otimização é adiada e documentada; fora do orçamento, implementar
paginação por cursor e carregamento em lote (agrupar as 3 subconsultas por
`searchTargetId` único em vez de por Watch) antes de fechar esta fase.

**Status (executado em 2026-09-21):** N=1 ~27ms, N=20 (teto real de hoje)
~47ms, N=100 ~172ms, N=500 ~856ms. Dentro do orçamento do MVP — a meta de
p95 de SPEC-001 §14 é 500ms, e o teto real (N=20) fica em ~47ms, larga
margem. **Decisão: otimização adiada, não esquecida.** Revisitar se/quando
`MAX_ACTIVE_WATCHES_PER_USER` (hoje um placeholder em
`apps/api/src/watches/watches.service.ts`) subir bem além de ~100-200, onde
a curva medida começa a se aproximar do orçamento. Metodologia completa em
`packages/database/src/__benchmarks__/fan-out-benchmark.ts`.

#### EVAL-PERF-003 — Backlog

50.000 jobs de verificação com provedor simulado.  
Esperado: throughput e idade máxima registrados; nenhum job perdido; escalabilidade aproximadamente proporcional até o primeiro gargalo documentado.

#### EVAL-COST-001 — Economia por deduplicação

100 Watches equivalentes durante um ciclo.  
Esperado: 1 consulta externa, não 100, salvo invalidação explicitamente registrada.

#### EVAL-COST-002 — Orçamento de consultas

Conjunto sintético por classes de prioridade.  
Esperado: total de checks não excede orçamento configurado e targets de menor prioridade são postergados de forma observável.

## 5. Suítes por momento

| Suíte   | Quando            | Conteúdo                                        |
| ------- | ----------------- | ----------------------------------------------- |
| Fast    | a cada alteração  | unitários, domínio, canonicalização             |
| PR      | pull request      | Fast + integração + evals determinísticos       |
| Main    | merge             | PR + E2E crítico + segurança                    |
| Nightly | diária            | performance reduzida, resiliência e replay      |
| Release | antes de produção | completa, migração, rollback e smoke controlado |

## 6. Scorecard

O build é reprovado se qualquer invariante crítica falhar. Não se usa média para esconder falha grave.

Categorias reportadas:

- correção funcional;
- integridade/idempotência;
- resiliência;
- segurança;
- performance;
- custo;
- observabilidade.

Resultados devem ser comparados com a baseline da branch principal. Regressões acima do orçamento definido exigem justificativa e aprovação, mesmo com todos os testes funcionais verdes.

## 7. Promoção da autonomia da IA

Métricas mínimas por janela de tarefas:

- percentual de PRs aprovados nos gates na primeira tentativa;
- regressões introduzidas;
- violações de escopo;
- intervenções humanas necessárias;
- incidentes e severidade;
- aderência entre spec e implementação.

Autonomia somente aumenta após amostra suficiente e pode ser reduzida imediatamente diante de falha crítica, mudança de domínio ou novo tipo de tarefa.
