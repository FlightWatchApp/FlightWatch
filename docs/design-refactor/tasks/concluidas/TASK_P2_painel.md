# TASK P2 — Painel e WatchCard

> Pacote: `docs/design-refactor/`. Specs: PG-02, CP-09. Nível de autonomia: 3 (`07-autonomia-progressiva.md`). Depende de: V4, V5, A3.

## Contexto

O painel lista monitoramentos no estilo antigo e não mostra promoções.

## Objetivo

Painel de PG-02 com `WatchCard` de CP-09 e a coluna de promoções.

## Não objetivos

- Mudar regras de status do Watch ou do ciclo de vida.

## Spec

- PG-02 e CP-09.
- EVAL-UI-STATE-001: os quatro estados distintos no painel.

## Arquivos permitidos

- `apps/web/src/app/page.tsx` (ramo com sessão), `page.module.css`
- `apps/web/src/components/watches/watch-card.*`, `watch-lifecycle-actions.*`
- `apps/web/src/components/account/email-verification-banner.*`

## Referência

`ref/redesign`: mesmos caminhos.

## Red

`eval-ui.mjs` com `overflow` em 320 no painel depois da troca (use `minmax(0, 1fr)`) ou screenshot "antes" + EVAL-UI-STATE-001 sem distinção visual.

## Evals e gates

- G1–G8
- EVAL-UI-STATE-001, RESP-001

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
