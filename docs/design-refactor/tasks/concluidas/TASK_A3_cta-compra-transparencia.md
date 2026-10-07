# TASK A3 — Botão de compra, aviso de comissão e /transparencia

> Pacote: `docs/design-refactor/`. Specs: SPEC-020 AC-006, CP-05, CP-06, PG-09, CP-12 (aviso), BR-04. Nível de autonomia: 3 (`07-autonomia-progressiva.md`). Depende de: A2.

## Contexto

Hoje há três jeitos de renderizar link de compra (`purchase-link-button.tsx`, `<a>` em `opportunity-card.tsx`, `<a>` em `offer-card.tsx`), nenhum com `sponsored`, nenhuma página com aviso, e não existe `/transparencia`.

## Objetivo

Um só componente de compra (`PurchaseButton`), o aviso (`PurchaseNote`) em toda página com compra, o aviso no rodapé e a página `/transparencia`.

## Não objetivos

- Redesenhar os cartões (isso é V4/P*). Aqui só troca o link e acrescenta o aviso.
- Criar texto além do que está em CP-06, CP-12 e PG-09.

## Spec

- Critérios de CP-05, CP-06 e PG-09.
- **Dado** qualquer página com botão de compra, **quando** carrega, **então** o aviso de comissão aparece perto do botão (`paginaSemAvisoComissao` = 0).
- **Dado** o texto "não garantido pelo fornecedor" em `offer-card.tsx`, **quando** a tarefa termina, **então** ele diz "Preço observado; pode mudar até a confirmação no site parceiro."

## Arquivos permitidos

- `apps/web/src/components/purchase/**` (novo)
- `apps/web/src/app/transparencia/**` (novo)
- `apps/web/src/components/layout/site-footer.tsx`
- `apps/web/src/components/watches/watch-card.tsx`, `purchase-link-button.tsx` (sai)
- `apps/web/src/app/watches/[id]/page.tsx`
- `apps/web/src/app/opportunities/opportunity-card.tsx`, `page.tsx`
- `apps/web/src/app/search/[id]/offer-card.tsx`, `page.tsx`
- `apps/web/src/app/page.tsx`
- `scripts/design/ceilings.json`

## Referência

`ref/redesign`: `apps/web/src/components/purchase/*`, `apps/web/src/app/transparencia/*`, `site-footer.tsx`.

## Red

baixe `compraSemSponsored` 3→0, `paginaSemAvisoComissao` 4→0, `semPaginaTransparencia` 1→0 e `frasesProibidas` 8→7; `pnpm check:design` falha nos quatro.

## Evals e gates

- G1–G7
- EVAL-UI-PURCHASE-001..004
- EVAL-UI-A11Y-001 passo 5 (leitor de tela no botão)

## Observações

- `PurchaseButton` importa `recordPurchaseClickAction` de `app/watches/actions.ts`, que já existe.

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
