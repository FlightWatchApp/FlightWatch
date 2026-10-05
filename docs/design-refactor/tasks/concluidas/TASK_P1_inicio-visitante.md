# TASK P1 — Início para visitante

> Pacote: `docs/design-refactor/`. Specs: PG-01, CP-14, MO-03. Nível de autonomia: 3 (`07-autonomia-progressiva.md`). Depende de: V4, V5, A3.

## Contexto

A home de visitante não mostra promoções nem explica o produto.

## Objetivo

Landing de PG-01 com hero, ilustração animada, promoções da API, como funciona, confiança e faixa final.

## Não objetivos

- Mudar o painel logado (P2).

## Spec

- PG-01 inteiro.

## Arquivos permitidos

- `apps/web/src/components/home/**` (novo)
- `apps/web/src/app/page.tsx` (ramo sem sessão)
- `apps/web/src/app/page.module.css`

## Referência

`ref/redesign`: `apps/web/src/components/home/*`, `apps/web/src/app/page.tsx`.

## Red

screenshot "antes" + rubrica R1, R3 e R7 abaixo de 4; `curl -s localhost:3100/ | rg "Promoções agora"` não encontra.

## Evals e gates

- G1–G8
- MO-03 (hero)
- rubrica completa na home

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
