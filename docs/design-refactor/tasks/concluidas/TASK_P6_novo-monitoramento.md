# TASK P6 — Novo monitoramento

> Pacote: `docs/design-refactor/`. Specs: PG-07. Nível de autonomia: 3 (`07-autonomia-progressiva.md`). Depende de: V4, V5.

## Contexto

Formulário no estilo antigo, com "preço-alvo" nos rótulos e mensagens.

## Objetivo

Formulário de PG-07 com "Preço desejado" em tudo.

## Não objetivos

- Mudar validação ou `POST /v1/watches`.

## Spec

- PG-07.

## Arquivos permitidos

- `apps/web/src/app/watches/new/**`
- `scripts/design/ceilings.json`

## Referência

`ref/redesign`: mesmos caminhos.

## Red

`frasesProibidas` aponta `new-watch-form.tsx` e `actions.ts`.

## Evals e gates

- G1–G8

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
