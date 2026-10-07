# Eval A2 — 2026-09-30

Branch: `main` · Nível 1 — diff mostrado e aprovado pelo owner antes de
aplicar (AskUserQuestion, "Sim, aplicar") · Quem rodou: Claude Code (agente)

## Plano

- Objetivo: as três superfícies (`WATCH`, `SEARCH`, `OPPORTUNITY`) passam
  `resolvePurchaseUrl(...)` por `withAffiliateTracking(url, providerStrategy,
surface)` antes de responder.
- Arquivos permitidos: `apps/api/src/affiliate/affiliate-links.ts` (novo),
  os 3 `*.service.ts` (só o ponto do `purchaseUrl`), `opportunities.e2e.spec.ts`,
  `watches.e2e.spec.ts`.
- Riscos: nenhum contrato muda (mesmo schema de `purchaseUrl: string | null`);
  sem `AFFILIATE_TRACKING_PARAMS` configurada, o link fica byte a byte igual
  ao de SPEC-018.
- Red escolhido: caso e2e novo em `opportunities.e2e.spec.ts` importando
  `resetAffiliateConfigCache` de um módulo que ainda não existe.

## Red

```text
$ pnpm --filter @flight-watch/api typecheck
src/opportunities/opportunities.e2e.spec.ts(12,43): error TS2307:
  Cannot find module '../affiliate/affiliate-links.js'
```

## Depois

```text
$ pnpm --filter @flight-watch/api typecheck   # verde
$ pnpm --filter @flight-watch/api lint        # verde
$ pnpm --filter @flight-watch/api test
 Test Files  8 passed (8)
      Tests  121 passed (121)   (118 antes + 3 novos: opportunities×2, watches×1)
$ pnpm --filter @flight-watch/api build        # verde
```

3 casos novos cobrem EVAL-AFF-001 (opportunities, params + utm_campaign=
opportunity), EVAL-AFF-002 (opportunities, variável ausente → purchaseUrl
idêntico a SPEC-018), e o equivalente de EVAL-AFF-001 na superfície `WATCH`
(utm_campaign=watch). EVAL-AFF-003 já estava coberto pelo teste pré-existente
"returns purchaseUrl: null when the deeplink host is not allowlisted"
(continua passando: a allowlist roda antes de `withAffiliateTracking`, que
nem chega a ser chamado com URL não-nula). EVAL-AFF-004/005 já estão cobertos
pelos unitários de A1 (`parseAffiliateTrackingConfig`).

## Gates

| Gate | Resultado | Observação                                                   |
| ---- | --------- | ------------------------------------------------------------ |
| G1   | verde     | exceto `next-env.d.ts` (pré-existente, P-07)                 |
| G2   | verde     | `eslint src`                                                 |
| G3   | verde     | `tsc`                                                        |
| G4   | verde     | 121 testes e2e (Postgres real via Testcontainers)            |
| G5   | verde     | `tsc -p tsconfig.build.json`                                 |
| G6   | verde     | `pnpm check:design` sem mudança (tarefa não toca `apps/web`) |

## Métricas

Nenhuma métrica de `ceilings.json` muda (tarefa é só API/backend).

## Screenshots

N/a — tarefa não toca tela.

## Pendência registrada

Não existe `.env.example` para `apps/api` hoje (só `packages/database/.env.example`).
Por instrução da própria ficha ("se não existir, registre em P-02 em vez de
criar arquivo novo"), não foi criado nenhum arquivo novo — `AFFILIATE_TRACKING_PARAMS`
fica documentada aqui e em `PROGRESS.md`, para entrar na tabela de env do
`CLAUDE.md` quando o owner resolver P-02.

## Revisão adversarial

1. Frase proibida? Não.
2. Preço sem idade/zero? N/a — schema de resposta não mudou.
3. Data/hora sem fuso fixo? N/a.
4. Animação quebrada? N/a.
5. Compra fora do `PurchaseButton`? N/a — ainda não existe `PurchaseButton`
   (chega em A3); esta tarefa só monta a URL no backend.
6. Cor fora de tokens? N/a.
7. 320px/teclado/movimento reduzido? N/a.
8. Diff fora da ficha? Não.

## Handoff

- Alterações: `apps/api/src/affiliate/affiliate-links.ts` (novo);
  `watches.service.ts`, `searches.service.ts`, `opportunities.service.ts`
  (1 ponto cada); `opportunities.e2e.spec.ts` (+2 casos), `watches.e2e.spec.ts`
  (+1 caso).
- Evidências: saída real acima.
- Limitações e riscos: `AFFILIATE_TRACKING_PARAMS` sem `.env.example` na API
  (P-02, registrado acima).
- Próximo passo: A3 (`PurchaseButton`, `PurchaseNote`, `/transparencia`).
