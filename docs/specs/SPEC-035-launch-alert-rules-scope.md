# SPEC-035 — Escopo das regras de alerta no lançamento

Status: implemented
Owner: owner do produto (decisão D1 do checklist pré-lançamento, 2026-10-10)
Dependencies: SPEC-001 (contrato de Watch), SPEC-014 (derivação de Watch a partir de oferta)

## Objective

A interface promete exatamente o que o backend entrega. No lançamento, todo
Watch criado pela web tem duas regras: **preço desejado** (`TARGET_PRICE`) e
**novo menor preço observado** (`NEW_OBSERVED_LOW`).

## Non-goals

- Seletor de regras, queda absoluta (`ABSOLUTE_DROP`) e percentual
  (`PERCENTAGE_DROP`). O domínio e a API continuam aceitando as quatro; só a
  interface não as oferece. Entram em spec própria depois do lançamento.
- Editar regras de um Watch existente.

## Actors and authorization

Usuário autenticado com canal verificado, como já era.

## Inputs and validation

O usuário informa só o preço desejado (maior que zero). `NEW_OBSERVED_LOW` não
tem parâmetro.

## Domain behavior and invariants

- Duas regras por Watch, tipos únicos (`assertUniqueAlertRuleTypes`).
- Cooldown de 12 h (43 200 s) em ambas, dentro do limite de 1 h a 30 dias.
- Texto da UI: "preço atingir esse valor ou menos, e também quando surgir um novo
  menor preço que observamos". Nunca "menor preço do mercado" (CLAUDE.md §2.3).

## API/event/job contract

Sem mudança. `POST /v1/watches` e `POST /v1/offers/:id/watch` já aceitam as
duas regras. Fonte única no web: `buildLaunchAlertRules`
(`apps/web/src/lib/domain/alert-rules.ts`).

## Persistence and migrations

Nenhuma.

## Idempotency and concurrency

Sem mudança; cada regra gera `AlertEvent` com chave de deduplicação própria.

## Failure modes and retries

Sem mudança.

## Security and privacy

Sem mudança.

## Observability

Sem métrica nova. `alert_rules_evaluated_total{type,result}` já distingue os
tipos.

## Performance and cost budget

Uma regra a mais por Watch na avaliação do alert-worker (leitura em lote já
paginada).

## Acceptance criteria

1. Watch criado em `/watches/new` tem `TARGET_PRICE` e `NEW_OBSERVED_LOW`.
2. Watch derivado de uma oferta tem as mesmas duas regras.
3. O texto do formulário descreve as duas condições.

## Tests and evals

`apps/web/src/lib/domain/alert-rules.test.ts` (regras e validação contra
`alertRuleInputSchema`). A avaliação das regras no backend já é coberta pelos
evals de alerta existentes.

## Rollout, rollback and kill switch

Mudança só no web; rollback = reverter o commit. Watches já criados com só
`TARGET_PRICE` continuam válidos.

## Open questions

- D2 (fonte de "Promoções agora") continua pendente: depende de aprovar e
  implementar a SPEC-032.

## Implementation evidence

- `apps/web/src/lib/domain/alert-rules.ts` e teste.
- `apps/web/src/lib/api/watches.ts`, `apps/web/src/lib/api/searches.ts`.
- `apps/web/src/app/watches/new/new-watch-form.tsx` (texto).
