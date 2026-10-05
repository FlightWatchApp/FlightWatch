# SPEC-004 — Persistir observação de preço

Status: draft para aprovação  
Versão: 0.1  
Owner: Pricing  
Dependências: SPEC-003, PostgreSQL, outbox

## 1. Objetivo

Persistir o resultado da pesquisa de forma imutável, selecionar deterministicamente a melhor oferta elegível, atualizar a execução e emitir evento para avaliação de alertas.

## 2. Entradas

- SearchExecution identificada;
- resultado normalizado `offers` ou `no_offers`;
- versão do adaptador e da política de seleção;
- metadados de cota, latência e correlação.

## 3. Política de seleção v1

1. Remover ofertas incompatíveis com target, passageiros ou moeda.
2. Ordenar por menor `totalAmountMinor`.
3. Em empate, menor duração total.
4. Em novo empate, menor número de conexões.
5. Em novo empate, assinatura normalizada lexicograficamente menor.

A versão `offer_selection_policy_version=1` é persistida. Alteração de critérios exige nova versão, testes e análise de impacto.

## 4. Assinatura e idempotência

`observation_key` baseline:

```text
SHA-256(search_execution_id|selected_offer_signature|observed_at_bucket|normalizer_version)
```

A execução lógica produz no máximo uma observação selecionada. Reprocessamento com o mesmo resultado retorna o registro existente. Resultado materialmente diferente para a mesma execução é conflito operacional e não reescreve a observação.

## 5. Transação de sucesso com ofertas

Na mesma transação:

1. bloquear/revalidar SearchExecution;
2. inserir PriceObservation imutável;
3. marcar execução `succeeded` com contagens e versões;
4. atualizar `last_checked_at` e próximo estado de agenda do target;
5. inserir `PriceObserved.v1` na outbox.

O último preço pode ser derivado pela consulta mais recente ou mantido como projeção reconstruível; a observação histórica continua sendo a fonte.

## 6. Transação sem ofertas

Na mesma transação:

1. marcar execução `no_offers`;
2. atualizar `last_checked_at` e próximo agendamento;
3. registrar metadados operacionais;
4. não criar PriceObservation;
5. não zerar nem apagar última observação;
6. opcionalmente emitir `PriceCheckCompletedWithoutOffers.v1` para produto/operação.

## 7. Imutabilidade

- nenhum `UPDATE` altera valor, moeda, itinerário ou instante de uma PriceObservation;
- flags de qualidade posteriores ficam em registro separado ou evento de anotação;
- correção gera nova observação/reprocessamento ligado à anterior, conforme futura spec;
- eliminação por política legal é operação auditada e fora do fluxo comum.

## 8. Critérios de aceitação

- AC-001: menor oferta elegível é persistida em unidade mínima.
- AC-002: empate produz sempre a mesma seleção.
- AC-003: `no_offers` não cria preço zero nem remove histórico.
- AC-004: transação falha por inteiro se outbox não puder ser persistida.
- AC-005: reprocessamento idêntico não duplica observação/evento lógico.
- AC-006: conflito material não altera dado já persistido.
- AC-007: moedas incompatíveis são rejeitadas antes da persistência válida.
- AC-008: versões do normalizador e da política são auditáveis.

## 9. Falhas

| Falha                           | Resultado                                     |
| ------------------------------- | --------------------------------------------- |
| execução inexistente            | erro não retentável ou DLQ após reconciliação |
| estado já terminal compatível   | sucesso idempotente                           |
| estado terminal incompatível    | conflito operacional                          |
| constraint transitória/deadlock | retry transacional limitado                   |
| banco indisponível              | job retentável; nenhum ack prematuro          |
| valor fora do limite            | execução falha por dados inválidos            |

## 10. Evento

`PriceObserved.v1`:

```json
{
  "eventId": "uuid",
  "searchTargetId": "uuid",
  "priceObservationId": "uuid",
  "amountMinor": 97000,
  "currency": "BRL",
  "observedAt": "RFC3339",
  "selectionPolicyVersion": 1,
  "correlationId": "opaque-id"
}
```

Não inclui usuário, contato ou payload bruto.

## 11. Testes e evals

- seleção e desempate;
- transação e outbox;
- concorrência/reprocessamento;
- imutabilidade no repositório e permissões de aplicação;
- `EVAL-PRICE-001` a `006`;
- `EVAL-IDEMPOTENCY-002` e `003`;
- `EVAL-QUEUE-001`.

## 12. Observabilidade

`price_observation_total{result}` (ADR-007) — `result` é `success`, `no_offers` ou `idempotent_replay` (a chave já existia — `persistPriceObservationSuccess` retorna a linha existente em vez de tentar duplicar, SPEC-004 §9; isso é a métrica de "conflito idempotente").

- diferença entre ofertas recebidas e elegíveis: `offers_received_total`/`offers_eligible_total`, já definidos em SPEC-003 §11 (mesmo processo/execução, sem duplicar definição aqui);
- no-offers por provider: cruzar `price_observation_total{result="no_offers"}` com `provider_call_total{provider,result="success"}` do mesmo período — `price_observation_total` não carrega label de provider (mantém o nome literal já fixado, evita cardinalidade desnecessária enquanto só existe um provedor ativo por vez).

**Fora do escopo desta fase** (infraestrutura/operação, não métrica de aplicação): latência de persistência (a escrita é uma transação Postgres única, de custo desprezível perto da chamada externa já coberta por `provider_call_duration_seconds`) e crescimento/tamanho da tabela (monitorado por ferramenta de operação de banco, não pelo processo da aplicação).

## 13. Performance e retenção

- inserts e consulta do último preço devem usar índice adequado;
- histórico usa paginação por cursor;
- payload grande fica fora da linha principal;
- política de retenção/particionamento será ativada somente com limiar mensurado.

## 14. Rollout e rollback

Adicionar tabelas/colunas/índices de forma expansiva. Consumidor pode ser pausado enquanto outbox acumula. Rollback não remove observações já gravadas.
