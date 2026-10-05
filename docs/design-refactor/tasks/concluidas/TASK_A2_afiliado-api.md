# TASK A2 — Afiliado nas três superfícies da API

> Pacote: `docs/design-refactor/`. Specs: SPEC-020 AC-001..004. Nível de autonomia: 1 (`07-autonomia-progressiva.md`). Depende de: A1.

## Contexto

Três serviços montam `purchaseUrl`: `watches.service.ts`, `searches.service.ts`, `opportunities.service.ts`.

## Objetivo

Os três passam o resultado de `resolvePurchaseUrl` por `withAffiliateTracking(url, providerStrategy, surface)`; configuração lida uma vez por processo; inválida loga `affiliate_config_invalid` e segue sem afiliado.

## Não objetivos

- Mudar schema de contrato, endpoint ou migração.
- Colocar valor real de afiliado em qualquer arquivo.

## Spec

- **Dado** `AFFILIATE_TRACKING_PARAMS` com o provider simulado, **quando** `GET /v1/opportunities`, **então** `offer.purchaseUrl` tem os parâmetros e `utm_campaign=opportunity` (EVAL-AFF-001).
- **Dado** a mesma variável e um deeplink fora da allowlist, **quando** `GET /v1/opportunities`, **então** `purchaseUrl` é `null` (EVAL-AFF-003).
- **Dado** variável vazia, **quando** qualquer das três rotas responde, **então** `purchaseUrl` é igual ao de antes (EVAL-AFF-002).
- **Dado** variável inválida, **quando** a API sobe e responde, **então** um log `affiliate_config_invalid` sem o valor da variável e links sem afiliado (EVAL-AFF-004).

## Arquivos permitidos

- `apps/api/src/affiliate/affiliate-links.ts` (novo)
- `apps/api/src/{watches,searches,opportunities}/*.service.ts` (só o ponto do `purchaseUrl`)
- `apps/api/src/opportunities/opportunities.e2e.spec.ts`
- recomendado: casos equivalentes em `watches.e2e.spec.ts`

## Referência

`ref/redesign`: mesmos caminhos; `git diff fa57198 ref/redesign -- apps/api`.

## Red

caso e2e novo em `opportunities.e2e.spec.ts` que configura a variável, chama `resetAffiliateConfigCache()` e espera os parâmetros: falha.

## Evals e gates

- G1–G5 (Docker ligado)
- EVAL-AFF-001..004

## Observações

- Nível 1: mostre o diff dos três serviços antes de aplicar; é resposta pública.
- Documente a variável no `.env.example` que existir para a API; se não existir, registre em P-02 em vez de criar arquivo novo.

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
