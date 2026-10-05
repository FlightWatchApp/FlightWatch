# TASK V1 — Tokens, fontes e movimento base

> Pacote: `docs/design-refactor/`. Specs: DS-01, DS-02, DS-03, DS-05, MO-01..04. Nível de autonomia: 1 (`07-autonomia-progressiva.md`). Depende de: F0.2.

## Contexto

Paleta azul-marinho/céu, Fraunces + Public Sans + IBM Plex Mono, borda de campo com 1,63:1, tokens de rota inexistentes, `rgba()` solto no modal.

## Objetivo

`tokens.css` e `globals.css` novos (paleta, semânticos, tipografia, espaço, raio, sombra, durações, `--keyframes-*`), fontes novas no `layout.tsx`, `.reveal`, `.iata`, `.tabular-nums` e movimento reduzido.

## Não objetivos

- Mudar componentes além do necessário para não quebrar (V3 em diante).
- Metadados e marca (V2).

## Spec

- DS-01, DS-02, DS-03, DS-05, MO-02 e MO-04 de `01-spec-design-system.md`.
- **Dado** qualquer `var(--*)` usado nos `.module.css` de `fa57198`, **quando** troco os tokens, **então** ele continua definido (mantenha o nome semântico ou migre o uso no mesmo PR); `rg -o "var\(--[a-z0-9-]+" apps/web/src` contra `tokens.css` não deixa sobra.
- **Dado** as telas atuais, **quando** a tarefa termina, **então** elas funcionam com a paleta nova sem nada ilegível (ainda com layout antigo).

## Arquivos permitidos

- `apps/web/src/styles/tokens.css`
- `apps/web/src/styles/globals.css`
- `apps/web/src/app/layout.tsx` (fontes)
- `apps/web/src/components/ui/modal.module.css` (overlay por token)
- módulos que usavam primitivo removido
- `scripts/design/ceilings.json`

## Referência

`ref/redesign`: `apps/web/src/styles/*`, `apps/web/src/app/layout.tsx`.

## Red

baixe `contrasteAbaixo` 6→0 e `corForaDosTokens` 1→0: `pnpm check:design` falha.

## Evals e gates

- G1–G8
- EVAL-UI-CONTRAST-001, TOKENS-001, MOTION-001, MOTION-003
- screenshots de todas as rotas (a paleta muda tudo)

## Observações

- Nível 1: mostre ao owner um antes/depois de 2 telas antes de seguir.

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
