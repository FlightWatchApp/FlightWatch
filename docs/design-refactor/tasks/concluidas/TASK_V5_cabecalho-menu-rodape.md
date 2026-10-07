# TASK V5 — Cabeçalho, menu e rodapé

> Pacote: `docs/design-refactor/`. Specs: CP-11, CP-12. Nível de autonomia: 3 (`07-autonomia-progressiva.md`). Depende de: V2, V3.

## Contexto

Cabeçalho e rodapé no estilo antigo; sem menu no celular com os itens novos; rodapé sem os links novos.

## Objetivo

`SiteHeader` + `MainNav` e `SiteFooter` de CP-11 e CP-12.

## Não objetivos

- Mudar autenticação ou o `logoutAction`.

## Spec

- CP-11 e CP-12.
- **Dado** 390 px, **quando** abro o menu por teclado, **então** `aria-expanded` muda, Esc fecha e o foco volta ao botão (EVAL-UI-A11Y-001 passos 1–3).
- **Dado** 390 px, **quando** rodo `eval-ui.mjs`, **então** nenhum link do cabeçalho ou rodapé abaixo de 24 px.

## Arquivos permitidos

- `apps/web/src/components/layout/**`
- `apps/web/src/app/layout.tsx` (link "Pular para o conteúdo", se faltar)

## Referência

`ref/redesign`: `apps/web/src/components/layout/*`.

## Red

EVAL-UI-A11Y-001 passos 1–3 falhando no "antes" e/ou `alvo<24` no rodapé.

## Evals e gates

- G1–G8
- EVAL-UI-A11Y-001, TOUCH-001

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
