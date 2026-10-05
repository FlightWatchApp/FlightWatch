# TASK F0.1 — Instalar o pacote no repositório

> Pacote: `docs/design-refactor/`. Specs: —. Nível de autonomia: 1 (`07-autonomia-progressiva.md`). Depende de: nenhuma.

## Contexto

O repositório está em `fa57198`. O pacote traz specs, scripts de verificação e fichas de tarefa que ainda não estão no repo.

## Objetivo

Pacote instalado num commit só de documentação e scripts, sem nenhuma mudança de comportamento.

## Não objetivos

- Alterar código de `apps/` ou `packages/`.
- Editar `CLAUDE.md`.

## Spec

- **Dado** o pacote descompactado, **quando** a tarefa termina, **então** existem no repo: `docs/design-refactor/**`, `docs/BRAND.md`, `flight-watch-foundation-v0.1/docs/specs/SPEC-020-*.md`, `SPEC-021-*.md` e `scripts/design/**`.
- **Dado** `flight-watch-foundation-v0.1/AGENTS.md`, **quando** a tarefa termina, **então** o conteúdo de `AGENTS-addendum.md` está colado ao final, sem nenhuma linha anterior alterada.
- **Dado** o `package.json` da raiz, **quando** a tarefa termina, **então** ele tem `"check:design": "node scripts/design/check-all.mjs"` e nada mais mudou.
- **Dado** `flight-watch-next-phases/06-spec-backlog.md`, **quando** a tarefa termina, **então** há uma seção curta para SPEC-020 e SPEC-021 com status "aprovada, implementação pendente" apontando para as specs canônicas.
- **Dado** o repo instalado, **quando** rodo `pnpm check:design`, **então** sai 0 com várias métricas `OK*` (dentro do teto, acima da meta).

## Arquivos permitidos

- `docs/`
- `flight-watch-foundation-v0.1/docs/specs/`
- `flight-watch-foundation-v0.1/AGENTS.md` (só acrescentar)
- `flight-watch-next-phases/06-spec-backlog.md`
- `scripts/design/`
- `package.json` (um script)

## Referência

`ref/redesign`: nenhuma (o pacote é a fonte).

## Red

`pnpm check:design` não existe (`ERR_PNPM_NO_SCRIPT`).

## Evals e gates

- G1 (`prettier --check` nos arquivos novos)
- `pnpm check:design` sai 0

## Observações

- Proponha o diff do `package.json` e do `AGENTS.md` antes de aplicar (nível 1).
- A pasta `referencia-visual/` do pacote **não** vai para o repo.

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
