# 08 — Backlog do refactor

> **Status: concluído (2026-10-01)** — as 19 tarefas abaixo (F0.1 a Z2)
> foram todas fechadas. Fichas arquivadas em
> `docs/design-refactor/tasks/concluidas/`. Detalhe de execução, métricas e
> evidência real de cada uma: `docs/design-refactor/PROGRESS.md` e
> `docs/design-refactor/evals/`.

Ordem de execução. Uma tarefa por branch e por PR. Cada tarefa tem ficha em
`docs/design-refactor/tasks/concluidas/` com Red, arquivos permitidos,
referência e evals. "Ref" = arquivos em `ref/redesign` para consultar.

## Visão geral

```text
F0.1 → F0.2
          ├─ A1 → A2 → A3 ─────────────────────────────┐
          └─ V1 ─┬─ V2 ─┐                               │
                 └─ V3 ─┼─ V4 ─┐                        │
                        └─ V5 ─┴─ P1 P2 P3 P4 P5 P6 P7 ─┴─ Z1 → Z2
```

A e V podem correr em paralelo depois da F0.2. As tarefas P dependem de A3, V4
e V5 e podem ser feitas em qualquer ordem entre si (a sugerida abaixo vai do
maior impacto para o menor).

## Fase 0 — Preparação (sem mudar comportamento)

| ID   | Tarefa                           | Specs  | Red                            | Nível |
| ---- | -------------------------------- | ------ | ------------------------------ | ----- |
| F0.1 | Instalar o pacote no repositório | —      | `pnpm check:design` não existe | 1     |
| F0.2 | Medir a linha de base            | 04, 05 | `ui.controlsBelow44` sem teto  | 3     |

## Fase A — Compra com afiliado (SPEC-020)

| ID  | Tarefa                                              | Specs                                       | Red                                                                                                                       | Nível |
| --- | --------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----- |
| A1  | `applyAffiliateTracking` no domínio                 | SPEC-020 AC-001..005                        | `affiliate-link.test.ts` (10 casos)                                                                                       | 3     |
| A2  | `withAffiliateTracking` nas três superfícies da API | SPEC-020 AC-001..004                        | e2e em `opportunities.e2e.spec.ts` (afiliado + allowlist)                                                                 | 1     |
| A3  | `PurchaseButton`, `PurchaseNote`, `/transparencia`  | SPEC-020 AC-006, CP-05, CP-06, PG-09, BR-04 | tetos `compraSemSponsored`, `paginaSemAvisoComissao`, `semPaginaTransparencia` → 0; `frasesProibidas` 8 → 7 ("garantido") | 3     |

## Fase V — Fundação visual (SPEC-021)

| ID  | Tarefa                                                          | Specs                             | Red                                                                              | Nível |
| --- | --------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------- | ----- |
| V1  | Tokens, fontes, movimento base                                  | DS-01..03, DS-05, MO-01..04       | tetos `contrasteAbaixo` e `corForaDosTokens` → 0                                 | 1     |
| V2  | Marca: arquivos, símbolo, logo, metadados                       | BR-01..03, CP-01, CP-02           | arquivos de BR-01 ausentes; `brand-mark.tsx` ainda usado                         | 3     |
| V3  | Base de UI                                                      | CP-15, DS-04, DS-06               | `ctrl<44` do `eval-ui.mjs` abaixo do teto da F0.2                                | 3     |
| V4  | Rota e preço: `RouteLine`, `Freshness`, `DealBadge`, `DealCard` | CP-03, CP-04, CP-07, CP-08, DS-07 | testes de `airportCity`/`airportLabel` e de `formatAbsoluteDateTime` em Brasília | 4     |
| V5  | Cabeçalho, menu e rodapé                                        | CP-11, CP-12                      | EVAL-UI-A11Y-001 passos 1–3 e `alvo<24` no cabeçalho em 390                      | 3     |

## Fase P — Páginas (SPEC-021)

| ID  | Tarefa                             | Specs               | Red                                                              | Nível |
| --- | ---------------------------------- | ------------------- | ---------------------------------------------------------------- | ----- |
| P1  | Início para visitante              | PG-01, CP-14, MO-03 | rubrica R1/R3/R7 < 4 no "antes"; home sem promoções              | 3     |
| P2  | Painel e `WatchCard`               | PG-02, CP-09        | EVAL-UI-STATE-001 e `overflow` em 320                            | 3     |
| P3  | Promoções                          | PG-03, CP-08        | `opportunity-card.tsx` ainda usado; alternador < 44 px           | 3     |
| P4  | Busca e resultado                  | PG-04, PG-05, CP-16 | `airportLabel` duplicado; teste do rótulo "horários de Brasília" | 3     |
| P5  | Detalhe do monitoramento e gráfico | PG-06, CP-10        | teste de ordenação cronológica dos pontos; `console` no detalhe  | 3     |
| P6  | Novo monitoramento                 | PG-07               | "preço-alvo" ainda aparece nas mensagens                         | 3     |
| P7  | Conta                              | PG-08, CP-13        | `alvo<24` em `/login` e `/register`                              | 3     |

## Fase Z — Fechamento

| ID  | Tarefa                    | Specs              | Red                                                            | Nível |
| --- | ------------------------- | ------------------ | -------------------------------------------------------------- | ----- |
| Z1  | Documentação viva         | SPEC-020, SPEC-021 | "Evidência de implementação" vazia; `DESIGN-SYSTEM.md` ausente | 1     |
| Z2  | Revisão final e relatório | 04 inteiro         | qualquer teto acima da meta                                    | 3     |

## Critério de pronto do backlog inteiro

- [x] todos os tetos de `ceilings.json` iguais à meta (0);
- [x] `eval-ui.mjs` com 0 em todas as colunas, todas as rotas;
- [x] AC-001..007 de SPEC-021 e AC-001..006 de SPEC-020 com evidência;
- [ ] rubrica visual assinada pelo owner — pré-avaliação entregue,
      assinatura pendente (`evals/2026-10-01-rubrica-visual-Z2.md`);
- [x] relatório final no formato de `CLAUDE.md` §20.3 —
      `evals/2026-10-01-Z2-revisao-final.md`.

## Fora deste backlog (não fazer sem decisão)

P-01 programa de afiliado real · P-03 Playwright/axe no repo · P-04 promoções
de rotas não monitoradas · P-06 gerador de peças sociais · canal de alerta por
WhatsApp. Ver `09-decisoes.md`.
