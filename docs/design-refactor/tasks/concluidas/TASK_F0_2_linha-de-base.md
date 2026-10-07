# TASK F0.2 — Medir a linha de base

> Pacote: `docs/design-refactor/`. Specs: 04-evals, 05-quality-gates. Nível de autonomia: 3 (`07-autonomia-progressiva.md`). Depende de: F0.1.

## Contexto

Os tetos de `ceilings.json` foram medidos em `fa57198` pelo autor do pacote. Falta medir no seu ambiente, e falta o teto de `ui.controlsBelow44`, que só o navegador mede.

## Objetivo

Um registro de eval com a saída real de todos os gates e evals no estado atual, e os tetos confirmados.

## Não objetivos

- Corrigir qualquer coisa encontrada (vira tarefa ou pendência).

## Spec

- **Dado** o repo em `fa57198` + F0.1, **quando** rodo G1 a G5, **então** a saída real está em `evals/AAAA-MM-DD-F0.2-baseline.md`, com a falha pré-existente de `next-env.d.ts` anotada (P-07).
- **Dado** `pnpm check:design`, **quando** comparo com `ceilings.json`, **então** cada métrica é igual ao teto; se for diferente, registre e ajuste o teto para o valor medido **só para baixo** (para cima, pergunte).
- **Dado** o sistema rodando (05 §"Como subir"), **quando** rodo `eval-ui.mjs --json`, **então** o resultado vai para o registro e `ui.controlsBelow44.teto` recebe o total medido.
- **Dado** as rotas de `03-spec-paginas.md`, **quando** tiro screenshots em 390 e 1440, **então** elas ficam em `docs/design-refactor/evals/baseline/` (ou fora do repo, se o owner preferir; registre onde).

## Arquivos permitidos

- `docs/design-refactor/evals/`
- `docs/design-refactor/PROGRESS.md`
- `scripts/design/ceilings.json`

## Referência

`ref/redesign`: nenhuma.

## Red

`ui.controlsBelow44` com `teto: null`.

## Evals e gates

- G1–G7 como medição, não como aprovação

## Observações

- Se Playwright não puder ser instalado fora do repo, registre e siga: G7 fica "não executado" com o motivo, e a rubrica passa a ser o eval visual das próximas tarefas até P-03.

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
