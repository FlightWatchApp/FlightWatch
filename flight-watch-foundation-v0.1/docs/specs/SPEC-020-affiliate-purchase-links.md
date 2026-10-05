# SPEC-020 — Link de compra com rastreio de afiliado

Status: implementada (A1–A3, 2026-09-30 — ver "Evidência de implementação")
Aprovada pelo owner em 2026-09-30 (decisão D-02 de
`docs/design-refactor/09-decisoes.md`)
Owner: Monitoring / Discovery
Dependências: SPEC-014, SPEC-015, SPEC-018

> Numeração: `flight-watch-next-phases/06-spec-backlog.md` reserva SPEC-019
> para "Catálogo, preferências e recomendações explicáveis". Esta spec usa o
> próximo número livre para não colidir com aquele backlog.

## Objetivo

Permitir que o Flight Watch receba comissão quando a pessoa compra uma passagem
no site parceiro a partir de qualquer um dos três CTAs de compra que já existem:

| Superfície    | Origem do link                        | Spec de origem |
| ------------- | ------------------------------------- | -------------- |
| `WATCH`       | `PriceObservation.deeplink`           | SPEC-018       |
| `SEARCH`      | `FlightSearchOffer.deeplink`          | SPEC-014       |
| `OPPORTUNITY` | `PriceObservation.deeplink` do `Deal` | SPEC-015       |

Sem mudar preço, ordem, elegibilidade ou classificação de nada que a pessoa vê,
e deixando o vínculo comercial explícito na interface.

Decisão de produto do owner (2026-09-30): "quero que eu consiga comprar
passagens normais através desse sistema, a ideia é fazer um link de afiliado e
ganhar uma parcela em cima da compra". Até então monetização estava `PROPOSTO`
em `CLAUDE.md` §1.3. Esta spec implementa o mecanismo; promover o item em
`CLAUDE.md` é do owner (P-02).

## Fora do escopo

- escolher ou contratar um programa de afiliados real (depende de provider
  real, `CLAUDE.md` §21 exige aprovação humana);
- reconciliação de comissão, postback de conversão, painel financeiro;
- redirecionamento por domínio próprio (`/go/:id`): o link continua apontando
  direto para o host allowlisted do provider;
- qualquer mudança em ranking, critério de promoção (SPEC-015) ou preço;
- novo endpoint, novo campo de contrato ou migração.

## Atores e autorização

- Operador: define os parâmetros por provider em variável de ambiente.
- Visitante e pessoa logada: recebem o `purchaseUrl` já com parâmetros nas
  mesmas respostas de hoje. A autorização de cada resposta não muda (o
  `purchaseUrl` de um Watch continua visível só para o dono).

## Entradas e validação

Variável de ambiente da API `AFFILIATE_TRACKING_PARAMS`, JSON por
`providerStrategy`:

```bash
AFFILIATE_TRACKING_PARAMS='{"SIMULATED":{"marker":"123456"}}'
```

`parseAffiliateTrackingConfig(raw)` nunca lança. Devolve
`{ ok: boolean, config }`:

- ausente ou vazia → `{ ok: true, config: {} }`;
- JSON malformado, raiz que não é objeto, provider cujo valor não é objeto →
  `{ ok: false, config: {} }`;
- chave fora de `^[A-Za-z0-9_.-]{1,40}$` ou valor fora de
  `^[A-Za-z0-9_.-]{1,80}$` → `{ ok: false, config: {} }` (impede injetar `&`,
  `=`, `/`, `:`, outro parâmetro ou redirecionamento no link do parceiro);
- chave reservada `utm_source`, `utm_medium` ou `utm_campaign` →
  `{ ok: false, config: {} }`.

Configuração inválida inteira vira "sem afiliado": um link sem comissão é
melhor que um link quebrado ou nenhum link.

## Comportamento de domínio e invariantes

```text
deeplink
  → resolvePurchaseUrl (SPEC-018: https + host na allowlist do provider)
  → applyAffiliateTracking (esta spec: só acrescenta query params)
  → purchaseUrl na resposta HTTP
  → <a target="_blank" rel="noopener noreferrer sponsored">
```

`applyAffiliateTracking(purchaseUrl, providerStrategy, surface, config)`, função
pura em `packages/domain/src/pricing/affiliate-link.ts`, exportada pelo
`index.ts` do package:

1. provider sem parâmetros configurados → devolve a URL idêntica (não marca
   como afiliado o que não é);
2. com parâmetros → `searchParams.set` de cada par, mais
   `utm_source=flightwatch`, `utm_medium=affiliate` e
   `utm_campaign=watch|search|opportunity` (a superfície, baixa cardinalidade);
3. nunca altera esquema, host ou caminho, e preserva a query que já existia;
4. URL não parseável → devolve a entrada sem mudança.

Invariantes:

- a proteção contra URL maliciosa continua sendo a allowlist de SPEC-018,
  aplicada **antes**; `null` de `resolvePurchaseUrl` continua `null`;
- o tipo `PurchaseSurface = 'WATCH' | 'OPPORTUNITY' | 'SEARCH'`;
- o domínio não lê `process.env` (a leitura fica na API).

## Contrato de API/evento/job

Nenhuma mudança de schema. O campo `purchaseUrl` que já existe em
`currentOfferSchema` (lista e detalhe de Watch,
`packages/contracts/src/watches/list-watches.ts`), na oferta de busca
(`searches/create-flight-search.ts`) e na oferta da promoção
(`opportunities/list-opportunities.ts`) passa a poder conter os parâmetros de
afiliado.

Na API, `apps/api/src/affiliate/affiliate-links.ts`:

- lê e guarda em cache por processo o resultado de
  `parseAffiliateTrackingConfig(process.env.AFFILIATE_TRACKING_PARAMS)`;
- `withAffiliateTracking(purchaseUrl | null, providerStrategy, surface)` com
  sobrecarga que preserva `null`;
- `resetAffiliateConfigCache()` só para testes.

Pontos de uso: `watches.service.ts` (`WATCH`), `searches.service.ts`
(`SEARCH`), `opportunities.service.ts` (`OPPORTUNITY`).

## Persistência e migrações

Nenhuma.

## Idempotência e concorrência

Função pura, sem estado além do cache de configuração lido uma vez por
processo.

## Modos de falha e retries

- Configuração inválida: log `affiliate_config_invalid` (sem o conteúdo da
  variável) e links sem afiliado. A API sobe normalmente.
- Mudar a variável exige reiniciar a API (cache por processo).

## Segurança e privacidade

- Parâmetros vêm do operador, nunca da pessoa usuária, e ainda assim passam por
  charset restrito.
- Nenhum identificador de pessoa, Watch ou sessão entra no link.
- Todo CTA usa `rel="noopener noreferrer sponsored"` (sem `Referer`, sem
  `window.opener`, e sinaliza link comercial).

## Observabilidade

- Log `affiliate_config_invalid` no primeiro uso com configuração inválida.
- Métricas existentes continuam valendo: `watch_purchase_link_click_total` e
  `purchase_link_missing_total` (SPEC-018). Nenhuma métrica nova com URL ou
  parâmetro como label.

## Performance e orçamento de custo

Uma chamada a `new URL()` por link montado. Irrelevante frente à consulta.

## Transparência na interface

- todo bloco com CTA de compra mostra `PurchaseNote`: "Você finaliza a compra
  no site parceiro. Podemos receber comissão, sem custo extra para você.
  Saiba mais" (link para `/transparencia`);
- `/transparencia` ("Como ganhamos dinheiro") explica quem vende, o que é link
  de afiliado, o que conta como promoção e por que o preço muda;
- o rodapé repete o aviso em todas as páginas;
- peças de divulgação (Instagram, WhatsApp) levam "Link de afiliado" visível
  (`docs/BRAND.md` §"Redes sociais"; Guia de Publicidade por Influenciadores
  Digitais do CONAR).

## Critérios de aceitação

- AC-001: provider com parâmetros configurados → `purchaseUrl` contém os
  parâmetros e os três `utm_*`, com host e caminho originais;
- AC-002: provider sem configuração → `purchaseUrl` idêntico ao de SPEC-018;
- AC-003: `deeplink` fora da allowlist continua virando `null` mesmo com
  afiliado configurado;
- AC-004: configuração inválida não derruba a API e não altera links;
- AC-005: configuração não sobrescreve `utm_*`;
- AC-006: os três CTAs de compra do web usam `rel="... sponsored"` e toda página
  com CTA mostra o aviso de comissão; `/transparencia` existe.

## Testes e evals

| AC  | Teste                                                                  | Eval               |
| --- | ---------------------------------------------------------------------- | ------------------ |
| 001 | `affiliate-link.test.ts` (aplicação) + e2e `opportunities.e2e.spec.ts` | EVAL-AFF-001       |
| 002 | `affiliate-link.test.ts` (provider sem config)                         | EVAL-AFF-002       |
| 003 | e2e `opportunities.e2e.spec.ts` com host fora da allowlist             | EVAL-AFF-003       |
| 004 | `affiliate-link.test.ts` (JSON malformado, forma inválida, charset)    | EVAL-AFF-004       |
| 005 | `affiliate-link.test.ts` (chave reservada)                             | EVAL-AFF-005       |
| 006 | `node scripts/design/check-purchase.mjs`                               | EVAL-UI-PURCHASE-* |

Casos mínimos do unitário: parse vazio, parse válido, JSON malformado, charset
inseguro, forma inválida, `utm_*` reservado, aplicação com parâmetros,
preservação de query existente, provider sem config, URL não parseável.

Recomendado: e2e também em `watches.e2e.spec.ts` e `searches` para a
superfície `WATCH` e `SEARCH`.

## Rollout, rollback e kill switch

- Rollout: deploy com a variável vazia (comportamento idêntico a SPEC-018);
  depois configurar o provider real quando houver programa aprovado (P-01).
- Kill switch: esvaziar `AFFILIATE_TRACKING_PARAMS` e reiniciar a API.
- Rollback de código: reverter os PRs A1–A3; nada persistido depende deles.

## Questões em aberto

- P-01: qual programa de afiliados e quais parâmetros reais (bloqueado pelo
  provider real, `CLAUDE.md` §1.3).
- P-02: promover monetização para decidido em `CLAUDE.md` e incluir
  `AFFILIATE_TRACKING_PARAMS` na tabela de variáveis (§10.2). Só o owner edita
  `CLAUDE.md`.

## Evidência de implementação

Status: **implementada** (A1–A3 de `docs/design-refactor/08-backlog.md`,
2026-09-30). Nada ainda commitado em `main` além do commit inicial
(`fa57198`) — por decisão do owner, todas as 19 tarefas do pacote
`docs/design-refactor/` seguem acumuladas na working tree até o pacote
inteiro fechar, e só então entram num commit (ou série de commits)
combinado. Esta seção cita arquivos, não commits.

### Arquivos

- `packages/domain/src/pricing/affiliate-link.ts` (+teste) — A1:
  `parseAffiliateTrackingConfig`, `applyAffiliateTracking`,
  `PurchaseSurface`, `AFFILIATE_UTM_SOURCE`.
- `apps/api/src/affiliate/affiliate-links.ts` — A2:
  `withAffiliateTracking`, `resetAffiliateConfigCache`, cache por processo
  de `AFFILIATE_TRACKING_PARAMS`.
- Pontos de uso (A2): `apps/api/src/watches/watches.service.ts` (`WATCH`),
  `apps/api/src/searches/searches.service.ts` (`SEARCH`),
  `apps/api/src/opportunities/opportunities.service.ts` (`OPPORTUNITY`).
- `apps/web/src/components/purchase/purchase-button.tsx` (A3, novo) —
  único componente que renderiza `<a>` de compra, `rel="noopener
noreferrer sponsored"`.
- `apps/web/src/components/purchase/purchase-note.tsx` (A3, novo) — aviso
  de comissão; usado em `app/page.tsx`, `app/search/page.tsx`,
  `app/search/[id]/page.tsx`, `app/watches/[id]/page.tsx`,
  `app/transparencia/page.tsx`, `components/home/landing.tsx`,
  `components/deals/deal-card.tsx`.
- `apps/web/src/app/transparencia/page.tsx` (A3, novo) — "Como ganhamos
  dinheiro", linkada do rodapé (`site-footer.tsx`) e do bloco de confiança
  da home.
- Removidos (A3): `components/purchase/purchase-link-button.tsx` e os
  `<a>` de compra soltos que existiam em `opportunity-card.tsx`/
  `offer-card.tsx` antes da unificação em `PurchaseButton`.

### Comandos executados e resultado real (2026-10-01)

```text
$ pnpm --filter @flight-watch/domain test
 ✓ src/pricing/affiliate-link.test.ts (12 tests) 9ms
 Test Files  12 passed (12)
      Tests  175 passed (175)

$ npx turbo run test --filter=@flight-watch/api --concurrency=1
 ✓ src/watches/watches.e2e.spec.ts (51 tests) 7461ms
 Test Files  8 passed (8)
      Tests  121 passed (121)

$ node scripts/design/check-all.mjs
OK   compraSemSponsored          0  (teto 0, meta 0)
OK   paginaSemAvisoComissao      0  (teto 0, meta 0)
OK   semPaginaTransparencia      0  (teto 0, meta 0)
Todas as métricas dentro do teto.
```

`affiliate-link.test.ts` cobre os 10 casos mínimos listados em "Testes e
evals" (parse vazio/válido, JSON malformado, charset inseguro, forma
inválida, `utm_*` reservado, aplicação com parâmetros, preservação de
query existente, provider sem config, URL não parseável). AC-001/002/004/005
verificados por esses 12 testes; AC-003 e a superfície `OPPORTUNITY`
verificados em `apps/api/src/opportunities/opportunities.e2e.spec.ts`
(host fora da allowlist → `purchaseUrl: null` mesmo com afiliado
configurado); a superfície `WATCH` verificada em `watches.e2e.spec.ts`.
AC-006 verificado por `check-purchase.mjs` (acima) — os três CTAs
(`WATCH`, `SEARCH` via `search/[id]/offer-card.tsx`, `OPPORTUNITY` via
`deal-card.tsx`) usam o mesmo `PurchaseButton`.

### O que não foi executado e por quê

- Nenhum provider de afiliado real foi configurado — `AFFILIATE_TRACKING_PARAMS`
  continua vazia neste ambiente, conforme P-01 (bloqueado por decisão
  comercial/contratual externa, `CLAUDE.md` §1.3). Todos os testes acima
  cobrem o caminho "sem configuração" e o caminho "com configuração de
  teste", nunca um provider real.
- P-02 (promover `AFFILIATE_TRACKING_PARAMS` e a monetização em
  `CLAUDE.md`) segue aberta — só o owner edita `CLAUDE.md`; ver o relatório
  de sugestões de Z1 entregue separadamente.
