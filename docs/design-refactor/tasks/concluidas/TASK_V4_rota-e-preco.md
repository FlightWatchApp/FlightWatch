# TASK V4 — Rota e preço: RouteLine, Freshness, DealBadge, DealCard

> Pacote: `docs/design-refactor/`. Specs: CP-03, CP-04, CP-07, CP-08, DS-07. Nível de autonomia: 4 (`07-autonomia-progressiva.md`). Depende de: V2, V3, A3.

## Contexto

Rotas aparecem como texto solto; a idade do preço não é padronizada; `opportunity-card.tsx` e `deal-badge.tsx` vivem em `app/opportunities/`; o rótulo de aeroporto está duplicado.

## Objetivo

Os quatro componentes de CP-03, CP-04, CP-07 e CP-08, mais `airportCity`/`airportLabel` e `DISPLAY_TIME_ZONE` em `lib/domain`, com teste.

## Não objetivos

- Trocar os cartões nas páginas (P2, P3); aqui os componentes nascem e `/opportunities` passa a usar o `DealCard`.

## Spec

- CP-03, CP-04, CP-07, CP-08, DS-07.
- **Dado** `TZ=UTC` e `TZ=America/Campo_Grande`, **quando** rodo os testes do web, **então** `formatAbsoluteDateTime('2026-09-30T15:44:00Z')` é `30/09/2026, 12:44` nos dois (EVAL-UI-TIME-001).
- **Dado** `airportLabel('GRU')` e `airportCity('JFK')`, **quando** testo, **então** `GRU · São Paulo/Guarulhos` e `Nova York/JFK`; código desconhecido devolve o próprio código / `null`.
- **Dado** o navegador em `America/Sao_Paulo`, **quando** abro `/opportunities`, **então** `console` = 0 (sem erro #418).

## Arquivos permitidos

- `apps/web/src/components/brand/route-line.*`
- `apps/web/src/components/ui/freshness.*`
- `apps/web/src/components/deals/**`
- `apps/web/src/lib/domain/freshness.ts` + teste
- `apps/web/src/lib/domain/airport-coordinates.ts` + teste
- `apps/web/src/app/opportunities/opportunity-card.tsx`, `deal-badge.tsx` (saem)
- `apps/web/src/app/opportunities/opportunities-client.tsx`

## Referência

`ref/redesign`: mesmos caminhos; atenção: na referência `airportLabel` está duplicado e deve ser extraído aqui.

## Red

testes novos de `formatAbsoluteDateTime` em Brasília e de `airportLabel`/`airportCity` falhando.

## Evals e gates

- G1–G8
- EVAL-UI-HYDRATION-001, MOTION-002, DEAL-001, RESP-001 (320 px com "Nova York/JFK")

## Observações

- Nível 4: toca `components/`, `lib/` e `app/opportunities`.

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
