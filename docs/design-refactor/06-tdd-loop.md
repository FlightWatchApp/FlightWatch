# 06 — Loop de TDD com IA no loop

Aplica `CLAUDE.md` §15.2 e `AGENTS.md` §3 às tarefas deste pacote. Cada tarefa
passa pelas seis etapas, nesta ordem, e o registro do eval mostra a saída real
de cada uma.

```text
Ler → Red → Green → Refactor → Eval → Review → Registrar
```

## 0. Ler

- `git status --short` (não apague trabalho alheio);
- ficha da tarefa, spec e IDs citados (DS, MO, BR, CP, PG, AC);
- arquivos atuais com `rg`, e os de referência com
  `git show ref/redesign:<caminho>`;
- escreva no topo do registro do eval: objetivo, arquivos permitidos, riscos,
  qual será o Red.

## 1. Red: algo falha pelo motivo esperado

Todo trabalho começa com uma verificação que falha **pela razão certa**. Qual
verificação depende do que a tarefa muda:

| A tarefa muda…                            | Red                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| regra pura (domínio, `lib/domain` do web) | teste Vitest novo                                                        |
| resposta da API                           | teste e2e da API (Testcontainers)                                        |
| regra medida por `check-all.mjs`          | **baixe o teto** em `ceilings.json` para a meta da tarefa e rode: falha  |
| regra medida no navegador                 | `eval-ui.mjs` mostrando a falha na rota (ou uma asserção nova no script) |
| só aparência                              | screenshot "antes" + item da rubrica que a tarefa precisa levar a ≥ 4    |

Exemplos reais deste refactor:

- A1: `affiliate-link.test.ts` com os 10 casos de SPEC-020 falha porque
  `applyAffiliateTracking` não existe.
- A3: `compraSemSponsored` teto 3 → 0; `check-all.mjs` falha apontando
  `opportunity-card.tsx`, `offer-card.tsx`, `purchase-link-button.tsx`.
- V4: `freshness.test.ts` com `formatAbsoluteDateTime('2026-09-30T15:44:00Z')
=== '30/09/2026, 12:44'` falha com "15:44" em `TZ=UTC`.

Se o Red não falha, ou falha por outro motivo (import errado, ambiente), o
teste não prova nada: corrija o teste antes de escrever código.

O web não tem ambiente de DOM nos testes (Vitest em Node, sem jsdom nem
Testing Library). Não adicione essas dependências sem decisão. Quando a lógica
de um componente precisa de teste, extraia a parte pura para
`apps/web/src/lib/domain/` e teste lá.

## 2. Green: o mínimo que passa

- implemente o menor comportamento que satisfaz a spec, olhando a referência
  quando existir;
- nada fora da ficha. Achou outro problema? Anote em "Fora do escopo" do PR e
  em `PROGRESS.md`;
- rode o gate do package afetado.

## 3. Refactor

- nomes, duplicação e tokens (`corForaDosTokens` não sobe);
- `pnpm lint` e `pnpm typecheck` do package;
- nenhuma mudança de comportamento nesta etapa.

## 4. Eval

- G1 a G7 de `05-quality-gates.md`;
- screenshots 390 e 1440 das rotas tocadas, antes e depois, com
  `reducedMotion: 'reduce'` (estado final estável) e uma sem, para conferir a
  animação;
- se a tarefa melhorou uma métrica, baixe o teto no mesmo commit.

## 5. Review: a IA revisa como adversária

Antes do PR, releia o diff inteiro procurando o que faria a revisão ou o CI
reprovar. Perguntas obrigatórias:

1. Algum texto novo usa frase proibida ou promete o que o sistema não
   garante?
2. Algum preço aparece sem idade, ou "sem oferta" virou zero?
3. Alguma data/hora é formatada sem fuso fixo num componente que roda no
   cliente?
4. Alguma animação num `.module.css` usa nome de keyframes global?
5. Algum link de compra fora do `PurchaseButton`, ou página com compra sem
   `PurchaseNote`?
6. Alguma cor nova fora de `tokens.css`, ou par de contraste novo fora de
   `PAIRS`?
7. O que muda com 320 px, com teclado e com movimento reduzido?
8. O diff toca arquivo fora da ficha? Por quê?

Quando possível, rode essa revisão numa sessão separada do agente, só com o
diff e este arquivo (prompt em `PROMPT-AGENTE.md` §"Revisão"). Achado dessa
revisão é bug até prova em contrário: verifique e corrija, ou responda por que
não.

## 6. Registrar

- `docs/design-refactor/evals/AAAA-MM-DD-<tarefa>.md` com comandos e saídas
  reais;
- `PROGRESS.md`: tarefa, métricas antes → depois, pendências;
- ficha da tarefa: seção "Handoff";
- spec: "Evidência de implementação", quando a tarefa fecha um AC.

## Quando parar

- duas tentativas seguidas sem melhorar a métrica: pare e registre o que tentou;
- o Red só passa mudando a spec: pare e pergunte;
- a tarefa exige dependência nova, mudança de contrato, migração, texto de
  política ou edição de `CLAUDE.md`: pare e pergunte (`07-autonomia-progressiva.md`).
