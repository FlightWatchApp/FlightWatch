# 00 — Contexto do refactor web v2

> Leia antes de qualquer tarefa deste pacote. Este documento não substitui
> `CLAUDE.md`, `AGENTS.md`, `DOMAIN.md` nem as
> specs: ele explica o que muda no web e por quê, e aponta para a spec certa.

## Para que serve este pacote

Levar o Flight Watch do estado commitado em `fa57198` para a experiência web v2
aprovada pelo owner em 2026-09-30:

1. o sistema continua **monitorando passagens** e passa a **mostrar as
   promoções que identifica** em destaque (início, painel e página de
   promoções);
2. a pessoa pode **comprar qualquer passagem** (de um monitoramento, de uma
   busca ou de uma promoção) no site parceiro, por **link de afiliado** que
   rende comissão ao Flight Watch, com o vínculo comercial sempre explícito;
3. o produto ganha **identidade visual própria** (símbolo, logo, paleta,
   tipografia) que também serve para Instagram e grupos de WhatsApp;
4. a interface ganha **animações curtas em pontos de significado**, com cara
   profissional e sóbria, mas bonita e atrativa.

As specs que autorizam o trabalho são:

| Spec                                                      | Escopo                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| `docs/specs/SPEC-020-affiliate-purchase-links.md`         | parâmetros de afiliado no link de compra, aviso e `/transparencia` |
| `docs/specs/SPEC-021-web-experience-v2.md`                | identidade visual, design system, promoções em destaque, animações |
| `docs/design-refactor/01-*.md` a `03-*.md` (este pacote)  | detalhamento de SPEC-021 com IDs verificáveis (DS, MO, BR, CP, PG) |
| SPEC-014, SPEC-015, SPEC-016, SPEC-018 (já implementadas) | busca, promoções, mapa e link de compra. Não mudam de contrato.    |

Caminho das specs: `docs/specs/`.

## Estado atual (VERIFICADO em `fa57198`, 2026-09-30)

- Monorepo pnpm + Turborepo: `apps/web` (Next 16, CSS Modules, porta 3100),
  `apps/api` (NestJS + Fastify, porta 3000), `scheduler`, `price-worker`,
  `alert-worker`, `notification-worker`; packages `domain`, `contracts`,
  `database` (Prisma), `providers` (só `SimulatedFlightProvider`), `queue`,
  `notifications`, `observability`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` passam. Os testes da
  API usam Testcontainers (precisa de Docker).
- `pnpm format:check` reprova `apps/web/next-env.d.ts`, arquivo que o Next gera
  com aspas duplas a cada build. É pré-existente; ver P-07 em
  `09-decisoes.md`. Não "conserte" desligando a regra.
- Rotas web: `/`, `/opportunities`, `/search`, `/search/[id]`, `/watches/new`,
  `/watches/[id]`, `/login`, `/register`, `/verify-email`.
- Promoções: a API já calcula `Deal` em leitura (SPEC-015, tipos
  `HISTORICAL_LOW` e `PERCENTAGE_BELOW_REFERENCE`) e expõe
  `GET /v1/opportunities`. No web elas só aparecem em `/opportunities`
  (`opportunity-card.tsx`), não na home nem no painel.
- Compra: `purchaseUrl` já vem validado pela allowlist de SPEC-018 em três
  superfícies (Watch, busca, promoção). Não há parâmetro de afiliado, nem aviso
  de comissão, nem `rel="sponsored"`, nem página de transparência.
- Visual: Fraunces + Public Sans + IBM Plex Mono, paleta azul-marinho/céu,
  `components/ui/brand-mark.tsx`, `components/watches/purchase-link-button.tsx`.
- Gate de design (`node scripts/design/check-all.mjs`) medido em `fa57198`:

  | Métrica                  | Valor | O que é                                                          |
  | ------------------------ | ----: | ---------------------------------------------------------------- |
  | `frasesProibidas`        |     8 | "não garantido" e sete "preço-alvo" (o termo é "preço desejado") |
  | `corForaDosTokens`       |     1 | `rgba()` no fundo do modal                                       |
  | `contrasteAbaixo`        |     6 | borda de campo com 1,63:1 e tokens de rota que não existem       |
  | `compraSemSponsored`     |     3 | links de compra sem `rel="sponsored"`                            |
  | `paginaSemAvisoComissao` |     4 | páginas com link de compra e sem aviso de comissão               |
  | `semPaginaTransparencia` |     1 | `/transparencia` não existe                                      |

## O que muda e o que não muda

**Muda (só o necessário):**

- `packages/domain`: função pura `applyAffiliateTracking` e o parser da
  configuração (SPEC-020).
- `apps/api`: os três pontos que montam `purchaseUrl` passam o link validado
  por `withAffiliateTracking`. Nenhum endpoint novo, nenhum campo novo no
  contrato, nenhuma migração.
- `apps/web`: tokens, fontes, marca, componentes e páginas (SPEC-021), página
  `/transparencia`, aviso de comissão ao lado de todo CTA de compra.
- Documentação viva: `docs/BRAND.md`, `docs/DESIGN-SYSTEM.md`, SPEC-020,
  SPEC-021, `docs/roadmap/06-spec-backlog.md`.

**Não muda (invariantes que o refactor não pode tocar):**

- regras de alerta, deduplicação `Watch`/`SearchTarget`, `PriceObservation`
  imutável, dinheiro em inteiro + moeda, no-offers nunca vira zero;
- critério de promoção de SPEC-015 (o web mostra o `deal.explanation` que a API
  manda; não recalcula);
- allowlist de SPEC-018 (afiliado só acrescenta query params depois dela);
- migrações publicadas;
- `CLAUDE.md` (só o owner altera; sugestões vão para `09-decisoes.md`).

## Implementação de referência

Existe uma implementação completa deste pacote, feita e verificada em
2026-09-30, entregue ao owner como `flightwatch-redesign.bundle` (pasta
`flight-watch-refactor/git/` do zip de entrega). Ela é **referência**, não
atalho: cada tarefa deste pacote aponta os arquivos correspondentes, e você
pode lê-los para acelerar, mas a tarefa só fecha com o teste que falha primeiro,
os evals e os gates rodando no seu branch.

Para consultar sem aplicar nada:

```bash
git fetch <caminho>/flightwatch-redesign.bundle claude/redesign-promocoes-afiliados:ref/redesign
git show ref/redesign:apps/web/src/components/deals/deal-card.tsx
git diff fa57198 ref/redesign --stat
```

Nunca faça merge, rebase ou cherry-pick de `ref/redesign` inteiro: o objetivo é
chegar ao mesmo resultado em PRs pequenos e verificáveis, um por tarefa.

## Referência visual

- Telas implementadas, desktop 1440 px e celular 390 px:
  `referencia-visual/*.png` no pacote (não vai para o repositório).
- Canvas estilo Figma com as 18 telas navegáveis (para pessoas):
  https://claude.ai/artifact/U3QSgUg87Cynp6Eo6Tm575
- Guia de marca (para pessoas): https://claude.ai/artifact/KtruuM1hVAFEYLUKjqJN9h

Quando a spec e a imagem divergirem, vale a spec. Registre a divergência em
`PROGRESS.md`.

## Mapa de leitura por tarefa

| A tarefa toca…                             | Leia antes                                              |
| ------------------------------------------ | ------------------------------------------------------- |
| qualquer coisa                             | este arquivo, `PROGRESS.md`, a ficha em `tasks/`        |
| link de compra, afiliado, `/transparencia` | SPEC-020, `02-spec-componentes.md` CP-05 e CP-06        |
| `styles/`, fontes, cores, animação         | `01-spec-design-system.md`                              |
| `public/brand`, símbolo, logo, metadados   | `01-spec-design-system.md` BR-\*, `docs/BRAND.md`       |
| um componente                              | `02-spec-componentes.md`                                |
| uma página                                 | `03-spec-paginas.md`                                    |
| fechar a tarefa                            | `04-evals.md`, `05-quality-gates.md`, `templates/pr.md` |
| dúvida de produto                          | `09-decisoes.md` (se não estiver lá, pergunte)          |

Não carregue os demais arquivos sem necessidade.
