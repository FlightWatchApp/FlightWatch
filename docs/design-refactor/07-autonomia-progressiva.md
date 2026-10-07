# 07 — Autonomia progressiva neste refactor

Usa os níveis de `CLAUDE.md` §21 e `AGENTS.md` §10. Autonomia aumenta por
desempenho medido, não por confiança.

| Nível | Pode                                               |
| ----- | -------------------------------------------------- |
| 0     | analisar e explicar                                |
| 1     | propor plano e diff                                |
| 2     | alterar testes e documentação aprovados            |
| 3     | implementar uma spec isolada em branch             |
| 4     | alterar vários módulos dentro de spec aprovada     |
| 5     | abrir PR e corrigir CI, sem merge                  |
| 6     | corrigir sozinho falha classificada de baixo risco |

## Nível inicial

**Nível 3** para todas as tarefas: uma tarefa por branch
(`refactor/<id>-<nome-curto>`, ex.: `refactor/a1-afiliado-dominio`), commits
pequenos, PR só quando o owner pedir ou quando ele liberar o nível 5.

Exceções que começam no nível 1 (propor e esperar):

| Tarefa | Por quê                                                      |
| ------ | ------------------------------------------------------------ |
| F0.1   | muda `package.json` (script `check:design`) e `AGENTS.md`    |
| A2     | muda resposta de três endpoints públicos                     |
| V1     | troca fontes e paleta do produto inteiro                     |
| Z1     | consolida documentação viva e sugere mudanças em `CLAUDE.md` |

## Sempre com aprovação humana explícita

- merge, push em `main`, deploy;
- dependência nova (inclusive Playwright/axe como devDependency, P-03);
- qualquer valor real de `AFFILIATE_TRACKING_PARAMS` ou outro segredo;
- editar `CLAUDE.md`, migração, contrato público ou política de privacidade;
- texto público novo que não esteja nas specs deste pacote (a página
  `/transparencia` e os avisos já estão; texto novo além deles, não);
- subir teto em `ceilings.json`;
- apagar arquivo que não seja substituído pela própria tarefa (ex.:
  `brand-mark.tsx` sai em V2 porque `BrandSymbol` o substitui; isso pode).

## Como subir de nível

Critérios medidos por fase (A, V, P), registrados em `PROGRESS.md`:

| Para    | Exigência                                                                                |
| ------- | ---------------------------------------------------------------------------------------- |
| nível 4 | 3 tarefas seguidas com G1–G7 verdes na primeira execução do PR e zero violação de escopo |
| nível 5 | fase inteira sem regressão encontrada depois (métrica voltando a subir, bug reaberto)    |
| nível 6 | não se aplica a este refactor                                                            |

Autonomia desce um nível na hora se: um gate foi declarado verde sem rodar,
um teto subiu sem decisão, o diff tocou arquivo fora da ficha sem explicação,
ou um texto proibido chegou ao PR.

## Métricas a registrar por tarefa

Na linha da tarefa em `PROGRESS.md`:

- gates verdes na primeira tentativa (sim/não e qual falhou);
- número de rodadas de review até aprovar;
- arquivos fora da ficha (0 é o esperado);
- métricas de `check-all.mjs` e `eval-ui.mjs` antes → depois;
- intervenções humanas (perguntas, correções).
