# 09 — Decisões

Decidido é lei para este refactor. Pendente bloqueia a tarefa que depende
dele: pergunte ao owner, não decida. Ao receber resposta, mova a linha para
"Decididas" com data e as palavras do owner.

## Decididas

| ID   | Data       | Decisão                                                                                                                                                                                 | Fonte                            |
| ---- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| D-01 | 2026-09-30 | O sistema, além de monitorar, **identifica promoções e as apresenta**. Usa a identificação que já existe (SPEC-015) e a coloca na home, no painel e em `/opportunities`.                | owner, pedido do refactor        |
| D-02 | 2026-09-30 | A pessoa compra passagens normais pelo sistema via **link de afiliado**; o Flight Watch ganha comissão. Compra acontece no site parceiro (SPEC-020).                                    | owner, pedido do refactor        |
| D-03 | 2026-09-30 | Identidade visual nova (petróleo, papel, tinta, laranja rota; Instrument Sans + JetBrains Mono; símbolo arco + lente) substitui a antiga, para produto, Instagram e grupos de WhatsApp. | owner aprovou o design e a marca |
| D-04 | 2026-09-30 | Animações em pontos importantes, com cara "profissional e sóbria, mas bonita e atrativa" (catálogo MO-03).                                                                              | owner, pedido do refactor        |
| D-05 | 2026-09-30 | As telas do canvas (https://claude.ai/artifact/U3QSgUg87Cynp6Eo6Tm575) e `referencia-visual/` são a referência visual.                                                                  | owner pediu a visualização       |
| D-06 | 2026-09-30 | Vínculo comercial sempre visível: aviso ao lado de todo CTA, `/transparencia`, rodapé e "Link de afiliado" nas peças de divulgação.                                                     | SPEC-020, CONAR                  |
| D-07 | 2026-09-30 | Grupos de WhatsApp e Instagram são **divulgação**. O canal de alerta continua e-mail; WhatsApp como alerta segue `PROPOSTO` em `CLAUDE.md` §1.3.                                        | `CLAUDE.md` §1.3                 |
| D-08 | 2026-09-30 | Instantes (observação, verificação, horário de voo) são exibidos em horário de Brasília (`DISPLAY_TIME_ZONE`) até P-05 ser decidida.                                                    | padrão técnico, evita erro #418  |

## Pendentes

| ID   | Pergunta para o owner                                                                                                                                            | Bloqueia                         | Padrão enquanto isso                              |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------- |
| P-01 | Qual programa de afiliados e quais parâmetros reais? Depende do provider real (`CLAUDE.md` §1.3, bloqueado).                                                     | configurar produção              | variável vazia; mecanismo pronto e testado        |
| P-02 | Atualizar `CLAUDE.md`: monetização de `PROPOSTO` para decidida (D-02), `AFFILIATE_TRACKING_PARAMS` na tabela §10.2, D-07 em §1.3, mapa do web. Só o owner edita. | nada (é documentação)            | sugestões prontas no relatório da Z1              |
| P-03 | Adicionar Playwright e axe-core como devDependencies do web, para os evals de navegador rodarem no CI?                                                           | eval de navegador no CI          | Playwright instalado fora do repo (`~/.fw-evals`) |
| P-04 | Mostrar promoções de rotas que ninguém monitora? Exige uma lista de rotas-semente consultadas pelo sistema, com custo de cota do provider.                       | promoções com a base vazia       | só rotas monitoradas (como SPEC-015 define)       |
| P-05 | Horário de voo no fuso do aeroporto ou de Brasília? O provider devolve instantes em UTC sem o fuso do aeroporto.                                                 | exibição de horário local        | Brasília, rotulado "horários de Brasília" (D-08)  |
| P-06 | Gerar peças de Instagram e mensagem de WhatsApp a partir de uma promoção dentro do produto?                                                                      | recurso de divulgação no produto | kit de marca e gerador fora do repo               |
| P-07 | Pôr `apps/web/next-env.d.ts` no `.prettierignore` (arquivo gerado pelo Next)?                                                                                    | `pnpm format:check` 100% verde   | registrar como pré-existente em cada PR           |
