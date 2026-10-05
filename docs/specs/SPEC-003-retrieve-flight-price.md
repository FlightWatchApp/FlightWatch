# SPEC-003 — Consultar e normalizar ofertas de voo

Status: draft para aprovação  
Versão: 0.1  
Owner: Pricing/Providers  
Dependências: SPEC-002, ADR-004

## 1. Objetivo

Consumir um job de preço, consultar o provedor selecionado dentro de seus limites, validar a resposta e produzir resultado normalizado, sem expor tipos externos ao domínio.

## 2. Pré-condições

- SearchExecution existe e está `scheduled` ou em retry permitido;
- target ainda é elegível;
- provider habilitado e credencial válida;
- rate limiter concede capacidade;
- circuit breaker permite tentativa.

## 3. Porta interna

```typescript
type ProviderSearchResult =
  | { kind: 'offers'; offers: FlightOffer[]; providerRequestId?: string }
  | { kind: 'no_offers'; providerRequestId?: string };

interface FlightProvider {
  search(query: FlightSearchQuery, context: ProviderContext): Promise<ProviderSearchResult>;
}
```

Erros são lançados/retornados como tipos internos classificados; objetos do SDK ficam confinados ao adaptador.

## 4. FlightOffer normalizada

Campos mínimos:

- `providerOfferId` opaco;
- `totalAmountMinor` inteiro positivo;
- `currency` ISO suportada;
- número de passageiros representados;
- segmentos com aeroportos, timestamps e transportadora;
- duração/conexões deriváveis;
- `observedAt` do sistema;
- `expiresAt` quando informado;
- deeplink/referência apenas se permitido;
- flags de qualidade e versão do normalizador.

Oferta que não possua total, moeda, rota ou correspondência com a consulta é rejeitada ou sinalizada conforme severidade. Não se inventa dado ausente.

## 5. Comportamento

1. Consumir job e conferir schema.
2. Obter a execução com controle idempotente.
3. Revalidar target e cancelamento.
4. Reservar cota/rate limit.
5. Marcar execução `running`.
6. Chamar adaptador com timeout e correlation ID.
7. Validar resposta externa.
8. Normalizar ofertas.
9. Filtrar incompatíveis.
10. Produzir `offers` ou `no_offers` para persistência da SPEC-004.

## 6. Política de erro

| Classe                   |           Retry | Ação                                                 |
| ------------------------ | --------------: | ---------------------------------------------------- |
| rate limit               | sim, após prazo | respeitar `Retry-After`, atualizar quota             |
| timeout/rede             |   sim, limitado | backoff exponencial com jitter                       |
| 5xx/indisponível         |   sim, limitado | circuit breaker                                      |
| autenticação/autorização |  não automático | abrir alerta e desabilitar integração se necessário  |
| consulta inválida        |             não | marcar permanente e revisar mapeamento/target        |
| payload malformado       |        não cego | guardar evidência sanitizada e alertar adapter owner |
| cancelamento             |             não | encerrar sem observação                              |

O número máximo de tentativas é configurado por classe. Retry não altera a chave da execução lógica.

## 7. Rate limiting

- limite global por provedor/endpoint;
- coordenação entre réplicas;
- consumo contabilizado mesmo em determinados erros, conforme contrato real;
- margem de segurança configurável;
- nenhum worker ignora o rate limiter.

## 8. Dados brutos

Payload bruto não é logado. Retenção opcional para diagnóstico requer criptografia, acesso restrito, sanitização e prazo definido. O caminho normal persiste somente dados normalizados e metadados operacionais.

## 9. Critérios de aceitação

- AC-001: resposta normal gera ofertas no contrato interno.
- AC-002: lista vazia gera `no_offers`, não preço zero.
- AC-003: moeda/total ausentes não viram observação válida.
- AC-004: 429 respeita o tempo indicado.
- AC-005: credencial inválida não entra em retry infinito.
- AC-006: timeout não apaga último dado nem bloqueia worker indefinidamente.
- AC-007: logs não contêm credencial ou payload bruto.
- AC-008: tipos do SDK não aparecem fora do adaptador.
- AC-009: processamento repetido preserva uma execução lógica.

## 10. Contract tests e evals

- fixtures de sucesso, múltiplas ofertas, vazio, malformado, 429 e timeout;
- validação de passageiros, rota, datas e moeda;
- `EVAL-PRICE-001` a `006`;
- `EVAL-PROVIDER-001` a `004`;
- `EVAL-SEC-003`.

Um smoke test real, separado e manual/agenda controlada, pode validar credenciais e mudança de contrato sem integrar a suíte comum.

## 11. Observabilidade

Nomes concretos (ADR-007, antes só descrito em prosa):

- `provider_call_total{provider,result}` — chamadas por provider/resultado; `result` é `success` ou a classe estável de erro (`RATE_LIMITED`, `UNAVAILABLE`, `AUTHENTICATION`, `VALIDATION`, `TIMEOUT`, `PERMANENT`, ou `circuit_open`/`local_rate_limited` quando a chamada nem chega a sair);
- `provider_call_duration_seconds{provider}` (histograma) — latência externa real, só de chamadas que efetivamente saíram (não inclui tempo bloqueado por circuit breaker/rate limit local);
- `offers_received_total` / `offers_eligible_total` (contadores, sem label de provider — evita alta cardinalidade) — ofertas recebidas versus elegíveis (SPEC-004 DR-013/`isOfferEligible`); a diferença entre os dois é "rejeitadas";
- `circuit_breaker_open` (gauge 0/1) — estado do circuit breaker no momento de cada tentativa.

**Cota consumida/restante e custo estimado por execução ficam fora do escopo desta fase**: só existe o provedor SIMULATED (ADR-004, seleção do provedor real ainda pendente), que não tem quota nem custo reais — instrumentar um número inventado seria enganoso. Implementar quando o provedor real for integrado.

Rótulos não incluem rota específica, usuário ou request ID de alta cardinalidade nas métricas; esses dados ficam em trace/log controlado.

## 12. Performance

Concorrência é limitada pela cota, conexão e CPU de normalização. Resposta possui limite máximo de tamanho e número de ofertas processadas configurável, com falha explícita em excesso.

## 13. Segurança

- base URL e endpoints vêm de configuração confiável;
- redirects e hosts são restritos;
- proteção contra SSRF;
- TLS validado;
- credenciais lidas de secret manager e nunca retornadas;
- deeplink é tratado como dado não confiável até validação.

## 14. Rollout e rollback

Provider inicia em modo sandbox/staging, passa por smoke controlado e canário de targets internos. Kill switch por provider permite rollback operacional sem alteração de dados.
