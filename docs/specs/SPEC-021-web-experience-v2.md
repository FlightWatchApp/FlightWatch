# SPEC-021 — Experiência web v2: identidade visual, promoções em destaque e transparência

Status: implementada (V1–V5, P1–P7, 2026-10-01 — ver "Evidência de
implementação"; AC-006 pendente de pré-avaliação em Z2 e assinatura do owner)
Aprovada pelo owner em 2026-09-30 (decisões D-01, D-03, D-04 e D-05 de
`docs/design-refactor/09-decisoes.md`)
Owner: Web
Dependências: SPEC-014, SPEC-015, SPEC-016, SPEC-018, SPEC-020
Detalhamento: `docs/design-refactor/01-spec-design-system.md`,
`02-spec-componentes.md`, `03-spec-paginas.md`

## Objetivo

Dar ao Flight Watch uma cara profissional e sóbria, mas bonita e atrativa, e
colocar na frente da pessoa o que o sistema já sabe fazer:

1. **promoções em destaque**: as promoções que a API já identifica (SPEC-015)
   aparecem na home de visitante, no painel de quem tem conta e na página de
   promoções, sempre com o motivo, a base de dados e a idade do preço;
2. **compra a partir de qualquer oferta**: monitoramento, busca e promoção
   levam ao site parceiro pelo mesmo botão, com o aviso de comissão
   (SPEC-020);
3. **identidade visual própria**: símbolo, logo, paleta, tipografia e voz que
   funcionam no produto, no e-mail, no Instagram e nos grupos de WhatsApp
   (`docs/BRAND.md`);
4. **movimento com significado**: animações curtas nos pontos que contam a
   história do produto (a rota, a queda de preço, a promoção), respeitando
   movimento reduzido.

Pedido do owner (2026-09-30): "quero que além de monitorar as passagens, o
nosso sistema também identifique as promoções e apresente ao usuário […] crie
também animações em pontos do sistema que você considerar importante […] eu
quero que ele tenha uma cara profissional e sóbria ao mesmo tempo, mas bonita e
atrativa ao usuário".

## Fora do escopo

- mudar como uma promoção é identificada (limiares e tipos de SPEC-015);
- promoções de rotas que ninguém monitora (P-04);
- novo endpoint, campo de contrato ou migração;
- canal de notificação por WhatsApp (continua `PROPOSTO` em `CLAUDE.md` §1.3;
  grupos de WhatsApp aqui são divulgação, não alerta);
- dependência nova de runtime no web. Playwright/axe como devDependency é a
  decisão pendente P-03;
- gerador de peças sociais dentro do repositório (P-06).

## Atores e autorização

Visitante (home, promoções, busca, resultado, transparência, conta) e pessoa
logada (painel, detalhe, novo monitoramento). Nenhuma regra de autorização
muda.

## Entradas e validação

As mesmas de hoje. Formulários mantêm as validações existentes (origem ≠
destino, preço desejado > 0) e passam a chamar o valor de "Preço desejado" em
todos os rótulos e mensagens.

## Comportamento de domínio e invariantes

- O web não recalcula promoção, alerta nem frescor de regra: mostra
  `deal.explanation`, `deal.observationCount` e as datas que a API manda.
- Dinheiro só por `formatMoney` a partir de inteiro + moeda. Sem oferta é "—",
  nunca zero (H04).
- Todo preço mostra a idade (`Freshness`). Instantes formatados em
  `DISPLAY_TIME_ZONE` (`America/Sao_Paulo`), datas de viagem em UTC.
- Linguagem obrigatória de `CLAUDE.md` §2.3 e `docs/BRAND.md` §"Tom de voz".

## Contrato de API/evento/job

Nenhuma mudança. Consumidos: `GET /v1/opportunities`, `GET /v1/watches`,
`GET /v1/watches/:id`, `POST /v1/watches`, `POST /v1/watches/:id/pause |
reactivate | cancel | purchase-click`,
`POST /v1/searches/flights`, `GET /v1/searches/flights/:id`,
`POST /v1/offers/:id/watch`, autenticação.

## Persistência e migrações

Nenhuma.

## Idempotência e concorrência

Sem efeito novo. "Monitorar preço" reusa `POST /v1/watches` (deduplicação de
SearchTarget intacta).

## Modos de falha e retries

- Feed de promoções falhando não derruba a home nem o painel: a seção mostra o
  estado vazio.
- Falha ao registrar clique de compra não bloqueia a navegação (SPEC-018).

## Segurança e privacidade

- Todo link externo com `rel="noopener noreferrer"`; link de compra também com
  `sponsored`.
- Nenhum dado pessoal em metadados, Open Graph ou peças de divulgação.
- `WEB_BASE_URL` (já usada pela API) define `metadataBase`; nenhuma variável
  `NEXT_PUBLIC_*` nova.

## Observabilidade

Sem métrica nova. Os evals de interface (`scripts/design/eval-ui.mjs`) medem
erro de console, hidratação e animação quebrada antes do merge.

## Performance e orçamento de custo

- Fontes por `next/font` (self-hosted, `display: swap`), duas famílias.
- Animações só em `transform`, `opacity` e `stroke-dashoffset`.
- SVG próprio para gráfico e ilustração; nenhuma biblioteca de gráfico ou
  animação.

## Critérios de aceitação

- AC-001: `node scripts/design/check-all.mjs` com todas as métricas na meta
  (0), incluindo contraste, cor fora de token, frases proibidas e contrato de
  compra.
- AC-002: `eval-ui.mjs` sem erro de console, sem rolagem horizontal em 320/390/
  1440, sem texto < 12 px, sem alvo < 24 px, sem animação apontando para
  keyframes inexistente e sem animação rodando com movimento reduzido, em todas
  as rotas de `03-spec-paginas.md`.
- AC-003: home de visitante e painel mostram promoções da API com motivo, base,
  idade, "Comprar passagem" e "Monitorar preço" (PG-01, PG-02).
- AC-004: todas as rotas usam a identidade nova (BR-01 a BR-03, DS-01 a DS-03)
  e nenhum arquivo da identidade antiga continua referenciado (`brand-mark.tsx`,
  Fraunces, Public Sans, IBM Plex Mono).
- AC-005: catálogo de movimento MO-03 implementado e visível sem movimento
  reduzido; com movimento reduzido, tudo no estado final.
- AC-006: rubrica visual (`templates/rubrica-visual.md`) com nota ≥ 4 em todos
  os itens, assinada pelo owner, comparando com `referencia-visual/`.
- AC-007: gates do repositório verdes: `pnpm format:check` (exceto P-07),
  `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Testes e evals

- Unitários em `apps/web/src/lib/domain/*.test.ts` para toda função pura nova ou
  alterada (formatação de tempo, rótulo de aeroporto, escala do gráfico quando
  extraída).
- Scripts determinísticos em `scripts/design/` (catraca em `ceilings.json`).
- Evals de navegador em `scripts/design/eval-ui.mjs`.
- Catálogo completo: `docs/design-refactor/04-evals.md`.

## Rollout, rollback e kill switch

- Um PR por tarefa de `08-backlog.md`, cada um verde nos gates.
- Rollback: reverter o PR da tarefa. Nenhuma mudança de dados.
- Sem feature flag (ADR exigiria). A troca visual é atômica por PR; enquanto a
  fase V não termina, páginas antigas convivem com tokens novos, o que é
  aceitável em branch e não deve ir para produção pela metade (ver
  `07-autonomia-progressiva.md`).

## Questões em aberto

P-03 (Playwright/axe no repo), P-04 (promoções além das rotas monitoradas),
P-05 (fuso de horário de voo), P-06 (gerador de peças sociais), P-07
(`next-env.d.ts` no format:check). Ver `09-decisoes.md`.

## Evidência de implementação

Status: **implementada** (V1–V5, P1–P7 de `docs/design-refactor/08-backlog.md`,
2026-09-30/2026-10-01). Nada commitado além do commit inicial (`fa57198`)
— mesma observação de SPEC-020: tudo acumulado na working tree por decisão
do owner, até o pacote inteiro fechar num commit combinado. Lista completa
de arquivos, achados e intervenções por tarefa:
`docs/design-refactor/evals/2026-09-30-V1-*.md` até
`2026-10-01-P7-conta.md` (17 documentos); resumo tabular e métricas em
`docs/design-refactor/PROGRESS.md`.

### Critérios de aceitação

- **AC-001** — `node scripts/design/check-all.mjs` (2026-10-01):

  ```text
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
  ```

  Todas as métricas na meta final (0). **Atendido.**

- **AC-002** — `eval-ui.mjs`, 9 rotas × 3 larguras, sessão/watch/busca
  reais (2026-10-01):

  ```text
  Totais: {"consoleErrors":0,"overflow":0,"smallText":0,"targetsBelow24":1,
           "controlsBelow44":0,"brokenAnimations":0,"runningWithReducedMotion":0}
  ```

  Quase integralmente atendido: `console`, `overflow`, `texto<12`,
  `ctrl<44`, `anim-quebrada` e `anim-c/reduce` em 0 em toda rota avaliada.
  **1 exceção conhecida**: `alvo<24=1` no link "← Voltar" de
  `search/[id]` (22px) — fora do escopo de cada ficha que tocou esse
  diretório (P4, depois confirmado fora de escopo em P5/P6/P7, todas
  limitadas a outros arquivos), nunca endereçado por nenhuma tarefa deste
  pacote. Registrado como pendência real, não escondido. **Atendido com
  uma exceção documentada.**

- **AC-003** — atendido: `components/deals/DealCard` (com `deal.explanation`,
  idade via `Freshness`, `PurchaseButton`) aparece na home de visitante
  (`components/home/landing.tsx`, P1), no painel de quem tem conta
  (`app/page.tsx`, P2) e em `/opportunities` (P3).

- **AC-004** — atendido: `grep` por `Fraunces|Public Sans|IBM Plex Mono|brand-mark`
  em `apps/web/src` não encontra nenhuma referência de código — só um
  comentário em `tokens.css` explicando que essas três fontes "saem do
  projeto". `components/ui/brand-mark.tsx` foi removido em V2.

- **AC-005** — atendido: catálogo de movimento implementado (ver
  `docs/DESIGN-SYSTEM.md` §Movimento, escrito nesta tarefa). Com
  `prefers-reduced-motion: reduce`, `--duration-*` zeram globalmente
  (`tokens.css`) e `PriceHistoryChart` tem uma regra própria adicional
  para garantir o estado final visível (ver eval de P5).

- **AC-006** — **não atendido nesta tarefa, por desenho do processo**: a
  ficha de Z1 não inclui preencher a rubrica (`07-autonomia-progressiva.md`
  e a própria ficha de Z2 atribuem essa pré-avaliação a Z2, com assinatura
  final do owner). `docs/design-refactor/templates/rubrica-visual.md`
  existe como template, ainda não preenchido. Também não existe
  `referencia-visual/` no repositório para a comparação lado a lado que o
  texto da spec prevê — gap a resolver em Z2 ou a registrar como divergência
  se a pasta nunca foi criada em nenhuma fase anterior.

- **AC-007** — gates do repositório (2026-10-01):

  ```text
  $ pnpm format:check   # verde exceto apps/web/next-env.d.ts (P-07, pré-existente)
  $ pnpm lint           # 13/13 tasks
  $ pnpm typecheck      # 20/20 tasks
  $ npx turbo run test --concurrency=1   # 20/20 tasks (concorrência default
                                          # derruba Testcontainers por pressão
                                          # de memória neste ambiente, ver A3)
  $ pnpm build          # 13/13 tasks
  ```

  **Atendido.**

### O que não foi executado e por quê

- AC-006 (rubrica assinada) — por desenho do processo, fica para Z2 +
  owner, não para Z1 (ver acima).
- Verificação de teclado real do menu mobile (V5) e do estado de sucesso
  de `/verify-email` (P7) — ambos documentados como limitação nos
  respectivos evals, por dependerem de um ambiente com teclado real /um
  token de verificação que só existe dentro do processo da API (decisão de
  segurança deliberada, não uma lacuna de teste).
- Nenhum provider de afiliado real, nenhuma integração de busca real —
  ambos `BLOQUEADO` em `CLAUDE.md` §1.3, fora do escopo de todo o pacote
  `docs/design-refactor/`.
