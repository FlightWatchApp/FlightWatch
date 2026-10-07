# TASK P3 — Página de promoções

> Pacote: `docs/design-refactor/`. Specs: PG-03, CP-08. Nível de autonomia: 3 (`07-autonomia-progressiva.md`). Depende de: V4, V5.

## Contexto

`/opportunities` já existe (SPEC-015/016) no visual antigo.

## Objetivo

Página de PG-03 com `DealCard`, ordenação, alternador Lista/Mapa com 44 px no celular e marcadores do mapa na cor da rota.

## Não objetivos

- Mudar a API de promoções ou o mapa (tiles, coordenadas).

## Spec

- PG-03.

## Arquivos permitidos

- `apps/web/src/app/opportunities/**`

## Referência

`ref/redesign`: mesmos caminhos.

## Red

`frasesProibidas` ainda conta "Preço-alvo" de `opportunity-card.tsx` se ele sobreviveu à V4; alternador com 36 px em `eval-ui.mjs`.

## Evals e gates

- G1–G8
- EVAL-UI-DEAL-001, TOUCH-002
- teste sem JavaScript (desligue no DevTools)

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
