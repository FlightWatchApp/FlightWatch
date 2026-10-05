# TASK A1 — Afiliado no domínio

> Pacote: `docs/design-refactor/`. Specs: SPEC-020 AC-001..005. Nível de autonomia: 3 (`07-autonomia-progressiva.md`). Depende de: F0.2.

## Contexto

`resolvePurchaseUrl` (SPEC-018) já valida o deeplink. Não existe forma de acrescentar parâmetros de afiliado.

## Objetivo

`parseAffiliateTrackingConfig` e `applyAffiliateTracking` puros, exportados por `@flight-watch/domain`, com o comportamento de SPEC-020 §"Entradas e validação" e §"Comportamento".

## Não objetivos

- Ler `process.env` no domínio.
- Mexer em `resolvePurchaseUrl`.

## Spec

- **Dado** variável vazia ou ausente, **quando** faço o parse, **então** `{ ok: true, config: {} }`.
- **Dado** `{"SIMULATED":{"marker":"123456"}}`, **quando** aplico em `https://parceiro/x?a=1` com superfície `WATCH`, **então** a URL mantém host, caminho e `a=1` e ganha `marker`, `utm_source=flightwatch`, `utm_medium=affiliate`, `utm_campaign=watch`.
- **Dado** JSON malformado, raiz array, valor com `&`, chave com espaço ou chave `utm_source`, **quando** faço o parse, **então** `{ ok: false, config: {} }`.
- **Dado** provider sem configuração ou URL não parseável, **quando** aplico, **então** devolve a entrada idêntica.

## Arquivos permitidos

- `packages/domain/src/pricing/affiliate-link.ts`
- `packages/domain/src/pricing/affiliate-link.test.ts`
- `packages/domain/src/index.ts` (uma linha de export)

## Referência

`ref/redesign`: mesmos caminhos.

## Red

`affiliate-link.test.ts` com os 10 casos de SPEC-020 §"Testes e evals" falhando porque o módulo não existe.

## Evals e gates

- G1–G5
- EVAL-AFF-002, 004, 005 cobertos pelo unitário

## Critérios de aceite

- [ ] Red registrado (saída real mostrando a falha pelo motivo esperado)
- [ ] Spec atendida, item por item
- [ ] Gates da seção acima verdes, com saída no registro do eval
- [ ] Tetos que melhoraram foram baixados em `ceilings.json`
- [ ] Screenshots 390 e 1440, antes e depois, quando a tarefa muda tela
- [ ] Diff só nos arquivos permitidos (ou ficha atualizada explicando)
- [ ] `PROGRESS.md` atualizado

## Handoff

- Alterações:
- Evidências (registro do eval):
- Limitações e riscos:
- Próximo passo:
