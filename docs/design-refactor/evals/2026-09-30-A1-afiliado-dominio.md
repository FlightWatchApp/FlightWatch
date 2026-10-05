# Eval A1 — 2026-09-30

Branch: `main` (sem branch separada — ver nota em `PROGRESS.md` sobre o modo de
trabalho desta sessão) · Quem rodou: Claude Code (agente)

## Plano

- Objetivo: `parseAffiliateTrackingConfig`/`applyAffiliateTracking` puros em
  `@flight-watch/domain`, sem ler `process.env`, sem tocar `resolvePurchaseUrl`.
- Arquivos permitidos: `packages/domain/src/pricing/affiliate-link.ts`,
  `affiliate-link.test.ts`, `packages/domain/src/index.ts` (1 linha).
- Riscos: nenhum — função pura nova, nenhum call site existente muda.
- Red escolhido: `affiliate-link.test.ts` com 12 casos falhando porque o
  módulo não existe.

## Red

```text
$ pnpm --filter @flight-watch/domain test -- affiliate-link
FAIL src/pricing/affiliate-link.test.ts
Error: Failed to load url ./affiliate-link.js ... Does the file exist?
Test Files  1 failed | 11 passed (12)
```

## Depois

```text
$ pnpm --filter @flight-watch/domain test
Test Files  12 passed (12)
     Tests  175 passed (175)   (163 antes + 12 novos)

$ pnpm --filter @flight-watch/domain typecheck   # verde
$ pnpm --filter @flight-watch/domain lint        # verde
$ pnpm --filter @flight-watch/domain build        # verde
```

## Gates

| Gate | Resultado | Observação                                             |
| ---- | --------- | ------------------------------------------------------ |
| G1   | verde     | nenhum arquivo novo com drift de formatação            |
| G2   | verde     | `eslint src` no pacote                                 |
| G3   | verde     | `tsc` no pacote                                        |
| G4   | verde     | 12 testes novos, 175 no total do pacote                |
| G5   | verde     | `tsc -p tsconfig.build.json`                           |
| G6   | n/a       | tarefa não toca `check-all.mjs` (nenhum arquivo `web`) |

## Métricas

Nenhuma métrica de `ceilings.json` muda nesta tarefa (é domínio puro, sem
efeito em cor/contraste/copy/compra do web).

## Screenshots

N/a — tarefa não toca tela nenhuma.

## Revisão adversarial

1. Frase proibida? Não — sem texto voltado ao usuário.
2. Preço sem idade/zero? N/a.
3. Data/hora sem fuso fixo? N/a.
4. Animação quebrada? N/a.
5. Compra fora do `PurchaseButton`? N/a — domínio não renderiza nada.
6. Cor fora de tokens? N/a.
7. 320px/teclado/movimento reduzido? N/a.
8. Diff fora da ficha? Não — só os 3 arquivos permitidos.

## Handoff

- Alterações: `packages/domain/src/pricing/affiliate-link.ts` (novo),
  `affiliate-link.test.ts` (novo), `packages/domain/src/index.ts` (+1 export).
- Evidências: saída real acima.
- Limitações e riscos: nenhum.
- Próximo passo: A2 (ligar as três superfícies da API).
