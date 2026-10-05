# TASK Z2 — Revisão final e relatório

> Pacote: `docs/design-refactor/`. Specs: 04-evals inteiro, SPEC-021 AC-001..007. Nível de autonomia: 3 (`07-autonomia-progressiva.md`). Depende de: Z1.

## Contexto

Todas as tarefas fechadas individualmente.

## Objetivo

Prova de que o conjunto cumpre as duas specs, e relatório final para o owner.

## Não objetivos

- Corrigir coisas grandes aqui: vira tarefa nova no backlog.

## Spec

- **Dado** `ceilings.json`, **quando** a tarefa termina, **então** todo teto é igual à meta (0).
- **Dado** `eval-ui.mjs` em todas as rotas, **quando** roda, **então** 0 em todas as colunas.
- **Dado** a rubrica, **quando** o agente faz a pré-avaliação, **então** ela vai marcada como pré-avaliação para o owner assinar.
- **Dado** o relatório, **quando** entregue, **então** segue `CLAUDE.md` §20.3 e lista riscos e pendências (P-*) sem esconder nada.

## Arquivos permitidos

- `docs/design-refactor/evals/`
- `docs/design-refactor/PROGRESS.md`
- `scripts/design/ceilings.json`

## Referência

`ref/redesign`: nenhuma.

## Red

algum teto acima da meta.

## Evals e gates

- G1–G9 completos
- EVAL-UI-A11Y-001
- EVAL-UI-VISUAL-001

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
