# Eval Z1 — 2026-10-01

Branch: `main` · Quem rodou: Claude Code (agente) · Nível de autonomia 1 —
plano aprovado pelo owner via pergunta explícita antes de executar (ver
transcript da sessão).

## Plano (aprovado antes de executar)

1. Escrever `docs/DESIGN-SYSTEM.md` do zero, usando `ref/redesign` como
   ponto de partida e corrigindo toda divergência real encontrada.
2. Preencher "Evidência de implementação" de SPEC-020 e SPEC-021 com
   arquivos, comandos reais e seus resultados.
3. Marcar SPEC-020/021 como implementadas em `06-spec-backlog.md`.
4. Entregar, em separado (não como edição de `CLAUDE.md`), o texto exato
   sugerido para cada seção — ver mensagem final da sessão.

Não objetivo cumprido: nenhuma edição em `CLAUDE.md`.

## Red

Confirmado antes de começar: as duas seções "Evidência de implementação"
(SPEC-020 linha 213, SPEC-021 linha 155) continham só instruções de
preenchimento ("Preencher ao fechar..."), sem nenhuma evidência real.

## Divergências encontradas entre `ref/redesign` e o código real

Documentadas dentro do próprio `docs/DESIGN-SYSTEM.md`, não só aqui:

1. **Alvo de toque**: a referência descreve um mínimo único de 44px em
   tudo. A regra real (`scripts/design/eval-ui.mjs`) é dupla — 24px para
   link de texto solto, 44px para controle — verificada contra o código
   fonte do próprio script de eval, não presumida.
2. **`PurchaseButton`**: a referência descreve uma seta que desliza no
   hover e um estado de clique "Abrindo o parceiro…". O componente real
   (`components/purchase/purchase-button.tsx`) não tem nenhum dos dois —
   rótulo fixo + ícone fixo + texto para leitor de tela. Verificado lendo
   o componente inteiro antes de escrever a tabela.

## Depois

```text
$ pnpm format:check
# verde exceto apps/web/next-env.d.ts (pré-existente, P-07)
```

Comandos citados como evidência dentro de SPEC-020/021 (reexecutados nesta
tarefa, não reaproveitados de memória):

```text
$ pnpm --filter @flight-watch/domain test        # 12/12 Test Files, 175/175 Tests
$ npx turbo run test --filter=@flight-watch/api --concurrency=1  # 8/8, 121/121
$ node scripts/design/check-all.mjs              # todas as métricas na meta 0
$ node scripts/design/eval-ui.mjs                # targetsBelow24=1 (conhecido), resto 0
$ pnpm lint                                      # 13/13 tasks
$ pnpm typecheck                                 # 20/20 tasks
$ pnpm build                                     # 13/13 tasks
```

## Gates

| Gate | Resultado | Observação                                   |
| ---- | --------- | -------------------------------------------- |
| G1   | verde     | exceto `next-env.d.ts` (pré-existente, P-07) |

Ficha de Z1 só exige G1 (`04-evals.md`/`05-quality-gates.md` — tarefa de
documentação, sem código de produto alterado). G2–G8 não se aplicam.

## Revisão adversarial

1. Alguma afirmação em `DESIGN-SYSTEM.md` não verificada contra o código
   real? Checado ponto a ponto nesta tarefa — ver "Divergências
   encontradas" acima, que é exatamente o tipo de afirmação que teria
   passado batido se só copiasse `ref/redesign`.
2. `CLAUDE.md` foi editado? Não — confirmado por `git status --short
CLAUDE.md` vazio.
3. SPEC-020/021 foram reescritas silenciosamente (mudando requisito
   aprovado) ou só tiveram a seção de evidência preenchida? Só a seção de
   evidência; o "Status" na primeira linha foi atualizado de "implementação
   pendente" para "implementada", que é a mudança de estado correta, não
   uma reescrita de requisito.
4. AC-006 de SPEC-021 (rubrica assinada) foi reivindicada como atendida
   sem assinatura real do owner? Não — marcada explicitamente como "não
   atendida nesta tarefa, por desenho do processo" (é escopo de Z2).
5. Diff fora da ficha? Nenhum — só os 4 arquivos permitidos
   (`docs/DESIGN-SYSTEM.md`, as duas specs, `06-spec-backlog.md`) mais
   este eval doc e `PROGRESS.md`.

## Handoff

- Alterações: `docs/DESIGN-SYSTEM.md` (novo), `SPEC-020-affiliate-purchase-links.md`
  (status + evidência), `SPEC-021-web-experience-v2.md` (status + evidência),
  `flight-watch-next-phases/06-spec-backlog.md` (status das duas specs).
- Evidências: comandos reais acima; as próprias specs citam saída real.
- Limitações e riscos: AC-006 de SPEC-021 (rubrica) segue sem assinatura —
  é o objetivo de Z2, não uma lacuna desta tarefa. `referencia-visual/`
  citada pela spec nunca existiu no repositório — registrado como
  divergência a resolver em Z2 ou a aceitar como nunca tendo sido criada.
- Próximo passo: Z2 (revisão final e relatório), nível de autonomia 3 —
  não precisa de aprovação prévia para começar, mas o relatório final em
  si é para o owner ler e decidir.
