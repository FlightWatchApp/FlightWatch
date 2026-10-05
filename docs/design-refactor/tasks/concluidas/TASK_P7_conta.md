# TASK P7 — Entrar, criar conta e verificar e-mail

> Pacote: `docs/design-refactor/`. Specs: PG-08, CP-13. Nível de autonomia: 3 (`07-autonomia-progressiva.md`). Depende de: V2, V3.

## Contexto

Telas de conta no estilo antigo.

## Objetivo

`AuthShell` de CP-13 em `/login` e `/register`; `/verify-email` no visual novo.

## Não objetivos

- Mudar autenticação, sessão ou verificação (SPEC-007, SPEC-010, ADR-006).

## Spec

- PG-08 e CP-13.

## Arquivos permitidos

- `apps/web/src/components/account/auth-shell.*` (novo)
- `apps/web/src/app/{login,register,verify-email}/**`

## Referência

`ref/redesign`: mesmos caminhos.

## Red

`alvo<24` no link do rodapé do formulário, ou screenshot "antes" + rubrica.

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
