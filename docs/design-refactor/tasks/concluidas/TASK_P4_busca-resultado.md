# TASK P4 — Busca e resultado

> Pacote: `docs/design-refactor/`. Specs: PG-04, PG-05, CP-16. Nível de autonomia: 3 (`07-autonomia-progressiva.md`). Depende de: V4, V5, A3.

## Contexto

Formulário e resultado no estilo antigo; horários sem fuso fixo; "Preço-alvo" no modal da oferta.

## Objetivo

Busca de PG-04 e resultado de PG-05 com `OfferCard` de CP-16.

## Não objetivos

- Mudar validação, rate limit ou contrato da busca (SPEC-014).

## Spec

- PG-04, PG-05, CP-16.
- **Dado** um voo às 11:00Z, **quando** o cartão renderiza, **então** mostra 08:00 e "horários de Brasília" (teste da função de formatação).

## Arquivos permitidos

- `apps/web/src/app/search/**`
- `scripts/design/ceilings.json`

## Referência

`ref/redesign`: mesmos caminhos (use `airportLabel` de `lib/domain`, não a cópia local).

## Red

teste do horário em Brasília falhando; `frasesProibidas` com "Preço-alvo" de `offer-card.tsx`.

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
