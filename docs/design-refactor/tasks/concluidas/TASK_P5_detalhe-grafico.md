# TASK P5 — Detalhe do monitoramento e gráfico

> Pacote: `docs/design-refactor/`. Specs: PG-06, CP-10. Nível de autonomia: 3 (`07-autonomia-progressiva.md`). Depende de: V4, V5, A3.

## Contexto

O detalhe mostra o histórico num gráfico simples no estilo antigo.

## Objetivo

Detalhe de PG-06 com painel de preço fixo e `PriceHistoryChart` de CP-10.

## Não objetivos

- Mudar SPEC-009 (série bruta, sem média móvel).

## Spec

- PG-06 e CP-10.
- **Dado** pontos vindos do mais novo para o mais antigo, **quando** o gráfico monta, **então** a linha vai do mais antigo ao mais novo (função pura testada).

## Arquivos permitidos

- `apps/web/src/app/watches/[id]/**`
- `apps/web/src/components/watches/price-history-chart.*`
- `apps/web/src/lib/domain/` (funções do gráfico, se extraídas)

## Referência

`ref/redesign`: mesmos caminhos.

## Red

teste de ordenação cronológica (extraia `sortChronologically` ou equivalente) falhando.

## Evals e gates

- G1–G8
- EVAL-UI-HYDRATION-001 no detalhe (atenção ao `<title>` de uma string só)
- MO-03 (linha desenha)

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
