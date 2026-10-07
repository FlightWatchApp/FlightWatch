# Eval Z2 — Revisão final e relatório — 2026-10-01

Branch: `main` · Quem rodou: Claude Code (agente) · Nível de autonomia 3
(execução sem aprovação prévia; um ponto específico — corrigir o último
`alvo<24` fora do allowlist formal da ficha — foi confirmado com o owner
antes de aplicar, ver "Intervenção" abaixo).

Segue `CLAUDE.md` §20.3.

## Red

A hipótese de Red da ficha ("algum teto acima da meta") não se confirmou:
todo `ceilings.json` já tinha `teto == meta` (0) antes desta tarefa — P6/P7
já tinham levado o pacote até ali. Em compensação, `eval-ui.mjs` tinha 1
desvio real da AC ("0 em todas as colunas"): `targetsBelow24=1` no
"← Nova busca" de `search/[id]` (22px), conhecido e documentado desde P4.
Esse foi o Red de fato encontrado e corrigido nesta tarefa.

## Intervenção: correção do último `alvo<24`, fora do allowlist formal de Z2

`apps/web/src/app/search/[id]/page.module.css` não está em nenhuma lista
de arquivos permitidos de nenhuma ficha deste pacote (nem de P4, que
tocou esse diretório, nem de Z2). Como a AC de Z2 exige literalmente "0 em
todas as colunas" de `eval-ui.mjs`, e a correção é o mesmo padrão de 3
linhas já aplicado duas vezes nesta sessão (P5, P6), perguntei ao owner
antes de aplicar. Resposta: corrigir agora. Aplicado:

```diff
 .back {
+  display: inline-flex;
+  align-items: center;
+  min-height: var(--space-6);
   color: var(--color-text-secondary);
   font-size: var(--text-sm);
   text-decoration: none;
 }
```

Rebuild + reteste confirmaram `targetsBelow24: 0` em todas as 9 rotas × 3
larguras — primeira vez que todo `eval-ui.mjs` fecha em zero absoluto
desde o início da sessão.

## Spec atendida

### SPEC-020 (critérios de aceitação, ver evidência completa na própria spec)

AC-001 a AC-006: todos atendidos — ver
`flight-watch-foundation-v0.1/docs/specs/SPEC-020-affiliate-purchase-links.md`
§"Evidência de implementação" (preenchida em Z1, reconfirmada aqui pelos
comandos abaixo).

### SPEC-021 (critérios de aceitação)

- AC-001 (`check-all.mjs` na meta): **atendido**.
- AC-002 (`eval-ui.mjs` 0 em toda coluna): **atendido nesta tarefa** —
  era a única pendência real do pacote inteiro.
- AC-003 (promoções na home/painel/página): **atendido** (P1/P2/P3).
- AC-004 (identidade antiga removida): **atendido**.
- AC-005 (catálogo de movimento, reduzido funciona): **atendido**.
- AC-006 (rubrica assinada pelo owner): **pré-avaliação entregue nesta
  tarefa** (`2026-10-01-rubrica-visual-Z2.md`), assinatura final é do
  owner — não posso assinar por ele, por desenho do próprio critério.
- AC-007 (gates do repositório verdes): **atendido**.

## Comportamento implementado (resumo)

19 tarefas do backlog (F0.1, F0.2, A1–A3, V1–V5, P1–P7, Z1, Z2) entregaram:
rastreio de afiliado nas três superfícies de compra (SPEC-020); identidade
visual nova (petróleo/papel, `BrandSymbol`/`Logo`/`RouteLine`); base de UI
migrada para os tokens novos; promoções em destaque na home, painel e
`/opportunities`; página de detalhe com gráfico de histórico reconstruído;
formulário de novo monitoramento e telas de conta (`AuthShell`) no visual
novo; `docs/DESIGN-SYSTEM.md` novo. Detalhe tarefa por tarefa:
`docs/design-refactor/PROGRESS.md`.

## Comandos executados e resultado real (2026-10-01, depois da correção acima)

```text
$ pnpm --filter @flight-watch/web typecheck && pnpm --filter @flight-watch/web lint
# ambos verdes

$ npx turbo run test --concurrency=1
 Tasks:    20 successful, 20 total

$ pnpm build
 Tasks:    13 successful, 13 total

$ pnpm format:check
# verde exceto apps/web/next-env.d.ts (pré-existente, P-07)

$ node scripts/design/check-all.mjs
OK   frasesProibidas             0  (teto 0, meta 0)
OK   animacaoSemKeyframes        0  (teto 0, meta 0)
OK   semMovimentoReduzido        0  (teto 0, meta 0)
OK   corForaDosTokens            0  (teto 0, meta 0)
OK   contrasteAbaixo             0  (teto 0, meta 0)
OK   blankSemNoopener            0  (teto 0, meta 0)
OK   compraSemSponsored          0  (teto 0, meta 0)
OK   paginaSemAvisoComissao      0  (teto 0, meta 0)
OK   semPaginaTransparencia      0  (teto 0, meta 0)
Todas as métricas dentro do teto.

$ FW_SESSION=... FW_WATCH_ID=... FW_SEARCH_ID=... node scripts/design/eval-ui.mjs
Totais: {"consoleErrors":0,"overflow":0,"smallText":0,"targetsBelow24":0,
         "controlsBelow44":0,"brokenAnimations":0,"runningWithReducedMotion":0}
```

10 rotas (`inicio`, `promocoes`, `busca`, `resultado`, `transparencia`,
`entrar`, `cadastro`, `painel`, `novo`, `detalhe`) × 3 larguras
(320/390/1440). **Zero em toda coluna, pela primeira vez em toda a
sessão.**

## Gates

| Gate               | Resultado                  | Observação                                                                        |
| ------------------ | -------------------------- | --------------------------------------------------------------------------------- |
| G1                 | verde                      | exceto `next-env.d.ts` (pré-existente, P-07)                                      |
| G2                 | verde                      | `pnpm lint` repositório inteiro                                                   |
| G3                 | verde                      | `pnpm typecheck` repositório inteiro                                              |
| G4                 | verde                      | `npx turbo run test --concurrency=1`, 20/20 tasks                                 |
| G5                 | n/a                        | sem integração nova nesta tarefa (G4 já cobre os e2e com Testcontainers de A1–A3) |
| G6                 | verde                      | `pnpm build`, 13/13 tasks                                                         |
| G7                 | n/a                        | sem rota nova                                                                     |
| G8                 | verde                      | `pnpm check:design` — todas as métricas na meta 0                                 |
| G9                 | feito                      | releitura adversarial abaixo                                                      |
| EVAL-UI-A11Y-001   | **parcial**                | ver "Riscos e pendências" — sem teclado/leitor de tela reais neste ambiente       |
| EVAL-UI-VISUAL-001 | **pré-avaliação entregue** | `2026-10-01-rubrica-visual-Z2.md`, assinatura pendente do owner                   |

### G9 — releitura adversarial (`CLAUDE.md` §19 "Front-end")

- [x] `docs/DESIGN-SYSTEM.md` foi respeitado — escrito nesta sessão a
      partir do código real, não o contrário.
- [x] Desktop e mobile foram verificados — 320/390/1440 em toda tarefa.
- [~] Navegação por teclado e foco visível funcionam — foco visível é
  global (`:focus-visible`) e todo controle interativo usa elemento
  nativo (`<button>`, `<a>`, `<dialog>`), o que já garante
  navegabilidade básica; o percurso completo de EVAL-UI-A11Y-001 com
  teclado e leitor de tela reais não foi executado (ver pendência).
- [x] Contraste e semântica são adequados — `contrasteAbaixo=0`.
- [x] Erro, no-offers e dado stale são distintos — `Freshness`/`EmptyState`
      tratam os três estados separadamente; nenhum preço vira zero (H04).
- [x] Preço não é apresentado como garantia de mercado — `frasesProibidas=0`.
- [x] Console do browser não possui erro relevante — `consoleErrors=0`.

## Migração, rollout e rollback

Sem persistência, sem contrato de API alterado (SPEC-020/021 confirmam
isso explicitamente). Nada aplicado em produção — tudo na working tree de
`main`, sem commit além do inicial (`fa57198`), por decisão do owner de
commitar tudo junto ao final. Rollback, se necessário depois do commit:
reverter o(s) commit(s) do pacote; nenhuma migração de dados para desfazer.

## Riscos e pendências (sem esconder nada)

Lista completa de `docs/design-refactor/09-decisoes.md` §Questões em
aberto, com estado real ao fim desta sessão:

| Item | Questão                                                               | Estado ao fim da sessão                                                                              |
| ---- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| P-01 | Programa de afiliado real e parâmetros                                | `BLOQUEADO` — depende de decisão comercial externa; mecanismo pronto e testado                       |
| P-02 | Promover `CLAUDE.md` (monetização, `AFFILIATE_TRACKING_PARAMS`, mapa) | Sugestões de texto entregues na mensagem final de Z1 (fora de arquivo, só o owner edita `CLAUDE.md`) |
| P-03 | Playwright/axe como devDependency do web                              | Pendente — usado o padrão seguro (`~/.fw-evals`, fora do repo) a sessão inteira                      |
| P-04 | Promoções de rotas não monitoradas                                    | Fora de escopo deste pacote (decisão já registrada antes desta sessão)                               |
| P-05 | Horário de voo: fuso do aeroporto vs. Brasília                        | Resolvido como Brasília (D-08), rotulado; fuso do aeroporto seguiria aberta                          |
| P-06 | Gerador de peças sociais no produto                                   | Fora de escopo deste pacote                                                                          |
| P-07 | `next-env.d.ts` no `.prettierignore`                                  | Pendente — registrado como pré-existente em toda tarefa desta sessão, nunca escondido                |

Pendências específicas desta sessão, não cobertas pela tabela acima:

- **AC-006 de SPEC-021 (rubrica assinada)**: pré-avaliação entregue
  (`2026-10-01-rubrica-visual-Z2.md`), nota mais baixa em R3 (4, não 5) —
  uso de `radial-gradient`/`shadow-lg` em dois lugares, restrito mas
  tecnicamente "decorativo"; julgamento final é do owner.
- **`referencia-visual/`**: a pasta que SPEC-021/04-evals.md citam para a
  rubrica nunca existiu no repositório desta sessão — a pré-avaliação usou
  os screenshots reais de cada tarefa e leitura de código em vez de uma
  comparação lado a lado.
- **EVAL-UI-A11Y-001**: percurso manual de teclado/leitor de tela não
  executado com hardware real neste ambiente (sem display, sem
  VoiceOver/NVDA) — mitigado por verificação de código e automação parcial
  (computed style, `:focus-visible` global, elementos nativos), mas é uma
  verificação genuinamente diferente de um teste manual real. Recomendo
  esse teste antes de produção, especialmente o menu mobile (V5) e o Modal
  "Monitorar preço".
- **Estado de sucesso de `/verify-email`**: nunca visualizado ao vivo
  (token de verificação é opaco e só trafega por e-mail, por desenho de
  segurança — ver eval de P7). Mitigado por revisão estática: o branch de
  sucesso compartilha a mesma estrutura e as mesmas regras de animação do
  branch de erro, já verificado ao vivo.
- **Achado de metodologia (não é risco de produto)**: Playwright
  `fullPage: true` pode capturar mal uma animação de entrada já terminada
  quando precisa redimensionar a viewport internamente — investigado a
  fundo em P7, confirmado como artefato da ferramenta, não do produto
  (`getComputedStyle`, captura isolada do elemento e resize real via
  `setViewportSize()` todos mostraram o estado correto). Documentado em
  `docs/DESIGN-SYSTEM.md` §Movimento para quem capturar evidência de telas
  altas no futuro.

Nenhum teto subiu sem decisão; nenhum gate foi declarado verde sem rodar;
nenhum texto proibido chegou a qualquer página.

## Documentação atualizada

- `docs/DESIGN-SYSTEM.md` (novo, Z1).
- `SPEC-020-affiliate-purchase-links.md`, `SPEC-021-web-experience-v2.md`
  — status e evidência de implementação (Z1).
- `flight-watch-next-phases/06-spec-backlog.md` — SPEC-020/021 marcadas
  implementadas (Z1).
- `docs/design-refactor/PROGRESS.md` — todas as 19 tarefas fechadas.
- `scripts/design/ceilings.json` — inalterado nesta tarefa (já estava
  todo na meta); nenhum teto subiu.

## Handoff

- Alterações desta tarefa: `apps/web/src/app/search/[id]/page.module.css`
  (`.back` com alvo de toque correto — único código tocado em Z2, com
  aprovação explícita do owner por estar fora do allowlist formal),
  `docs/design-refactor/evals/2026-10-01-rubrica-visual-Z2.md` (novo),
  este arquivo, `PROGRESS.md` (fechamento final).
- Evidências: comandos reais acima; `eval-ui.mjs` em 0 absoluto pela
  primeira vez na sessão; rubrica pré-avaliada.
- Limitações e riscos: ver "Riscos e pendências" — nada escondido, nada
  novo além do que já era conhecido e rastreado desde antes desta sessão
  (P-01 a P-07) mais os 4 itens específicos de Z1/Z2 listados acima.
- Próximo passo: nenhuma tarefa do backlog de 19 itens resta. Decisão do
  owner: revisar e assinar a rubrica visual; decidir sobre as sugestões de
  `CLAUDE.md` de Z1; e, quando pronto, pedir o commit combinado de todo o
  pacote (instrução já dada no início da sessão: "termina todas as tarefas
  e depois vamos commitar").
