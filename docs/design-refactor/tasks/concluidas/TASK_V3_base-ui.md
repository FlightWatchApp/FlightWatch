# TASK V3 — Base de UI

> Pacote: `docs/design-refactor/`. Specs: CP-15, DS-04, DS-06. Nível de autonomia: 3 (`07-autonomia-progressiva.md`). Depende de: V1.

## Contexto

Os componentes de `components/ui/` usam o estilo antigo; `Button` não tem `lg` nem `loading`; alguns ícones da referência não existem.

## Objetivo

`Button`, `IconButton`, `Modal`, `InlineAlert`, `StatusTag`, `Skeleton`, `EmptyState`, `FormField`, `TextInput`, `Select` e `icon.tsx` no visual novo, com alvos de toque de DS-04.

## Não objetivos

- Mudar comportamento dos componentes além do que CP-15 lista.

## Spec

- CP-15 e DS-04.
- **Dado** 390 px, **quando** meço com `eval-ui.mjs`, **então** `ctrl<44` fica abaixo do teto da F0.2 e o teto baixa.

## Arquivos permitidos

- `apps/web/src/components/ui/**`
- `scripts/design/ceilings.json`

## Referência

`ref/redesign`: `apps/web/src/components/ui/*`.

## Red

baixe `ui.controlsBelow44` para o alvo desta tarefa (os controles de `components/ui`) e rode `eval-ui.mjs`: falha.

## Evals e gates

- G1–G8
- EVAL-UI-TOUCH-001/002
- EVAL-UI-A11Y-001 passo 4 (modal)

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
