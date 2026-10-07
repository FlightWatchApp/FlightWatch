# TASK Z1 — Documentação viva

> Pacote: `docs/design-refactor/`. Specs: SPEC-020, SPEC-021, CLAUDE.md §0.3. Nível de autonomia: 1 (`07-autonomia-progressiva.md`). Depende de: todas as P.

## Contexto

As specs estão sem evidência; `docs/DESIGN-SYSTEM.md` não existe; o backlog de specs não reflete o estado.

## Objetivo

Documentação que descreve o que foi feito, com evidência verificável, e uma lista de sugestões para `CLAUDE.md` que o owner decide.

## Não objetivos

- Editar `CLAUDE.md`.

## Spec

- **Dado** SPEC-020 e SPEC-021, **quando** a tarefa termina, **então** "Evidência de implementação" lista PRs, arquivos e comandos com resultado real.
- **Dado** `docs/DESIGN-SYSTEM.md`, **quando** a tarefa termina, **então** ele descreve tokens, regras de conteúdo, componentes, movimento e acessibilidade do que existe no código (use a versão de `ref/redesign` como ponto de partida e corrija onde o seu código diverge).
- **Dado** `06-spec-backlog.md`, **quando** a tarefa termina, **então** SPEC-020 e SPEC-021 aparecem como implementadas, apontando para as specs canônicas.
- **Dado** P-02, **quando** a tarefa termina, **então** o relatório para o owner traz o texto exato sugerido para cada seção de `CLAUDE.md`.

## Arquivos permitidos

- `docs/DESIGN-SYSTEM.md`
- `flight-watch-foundation-v0.1/docs/specs/SPEC-020-*.md`, `SPEC-021-*.md`
- `flight-watch-next-phases/06-spec-backlog.md`
- `docs/design-refactor/PROGRESS.md`

## Referência

`ref/redesign`: `docs/DESIGN-SYSTEM.md`.

## Red

seções "Evidência de implementação" vazias.

## Evals e gates

- G1

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
