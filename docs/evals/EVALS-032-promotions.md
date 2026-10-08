# EVALS-032 — Promoções por origem

**Spec:** `docs/specs/SPEC-032-promotion-detection.md`  
**Data:** 2026-10-07

Os evals 002 a 006 são automáticos e rodam no gate (`pnpm test`). O 001 depende
de um conjunto rotulado pelo owner e ainda não conta.

| Eval           | O que garante                                                                     | Meta | Onde roda                                                                                                                                          | Estado                      |
| -------------- | --------------------------------------------------------------------------------- | ---: | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| EVAL-PROMO-001 | precisão do critério contra rótulos do owner ("é / não é promoção")               | 90 % | conjunto abaixo, ≥ 50 casos reais                                                                                                                  | **pendente** (sem conjunto) |
| EVAL-PROMO-002 | desconto a partir de 7000 bps nunca aparece no feed                               | 100% | `packages/domain/src/promotion/promotion.test.ts` (7000 → `SUSPECT`, 6999 → qualifica); `promotions.e2e.spec.ts` (MIA a 90% fora do feed, métrica) | automático                  |
| EVAL-PROMO-003 | abaixo do mínimo de referência, nenhuma afirmação estatística                     | 100% | `promotion.test.ts` (7 pontos → `INSUFFICIENT_DATA`; inválidos não contam); `promotions.e2e.spec.ts` (DOU fora do feed)                            | automático                  |
| EVAL-PROMO-004 | toda promoção do feed tem referência, pontos, meses, explicação e idade           | 100% | contrato Zod (`promotionItemSchema`, campos obrigatórios); `promotions.e2e.spec.ts` (RIO com todos os campos)                                      | automático                  |
| EVAL-PROMO-005 | origem quente: 0 chamadas; duas requisições simultâneas de origem fria: 1 cálculo | 100% | `promotions.e2e.spec.ts` ("origem quente", "duas requisições simultâneas")                                                                         | automático                  |
| EVAL-PROMO-006 | orçamento esgotado: 0 chamadas do feed; busca e calendário inalterados            | 100% | `promotions.e2e.spec.ts` ("orçamento esgotado")                                                                                                    | automático                  |

## EVAL-PROMO-001 — como montar o conjunto

Cada caso é uma linha com o candidato, os preços de referência que o sistema
usou e o rótulo do owner. A fonte mais simples é o próprio feed real: o cartão
traz a explicação e o calendário da rota mostra os preços.

| #   | Origem → destino | Data | Preço | Mediana (pontos, meses) | Desconto (bps) | Saída do sistema | Rótulo do owner | Observação |
| --- | ---------------- | ---- | ----: | ----------------------- | -------------: | ---------------- | --------------- | ---------- |
| 1   |                  |      |       |                         |                |                  |                 |            |

Precisão = casos em que a saída do sistema (`QUALIFIES` ou não) bate com o
rótulo ÷ total. Abaixo de 90 %, ajustar limiares por variável de ambiente
(`PROMOTION_MIN_*_DISCOUNT_BPS`, `PROMOTION_MIN_REFERENCE_POINTS`) e registrar
a mudança na spec.
