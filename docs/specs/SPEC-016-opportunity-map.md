# SPEC-016 — Mapa de oportunidades

Status: draft para aprovação
Owner: Monitoring
Dependências: SPEC-014, SPEC-015,
`docs/roadmap/rascunhos/SPEC-016-opportunity-map.md`,
`docs/roadmap/03-visual-and-ux-direction.md`

## Objetivo

Dar uma segunda forma de explorar o feed de oportunidades (SPEC-015): um
toggle Lista/Mapa na página `/opportunities`, com um marcador por destino
distinto, usando OpenStreetMap + Leaflet (sem custo, sem API key). A lista
continua sendo a via completa e funcional; o mapa é aditivo.

Implementado como "Passagem 2 — diferenciação"
(`03-visual-and-ux-direction.md`), depois de SPEC-015 ("Passagem 1 —
fundação") estar completo e verificado — mesma ordem que o próprio doc de
UX já recomendava.

## Fora do escopo

- **catálogo real de `Destination`** (geodados licenciados/versionados,
  clustering, múltiplos aeroportos por cidade): o mapa mostra só os 7
  aeroportos já suportados (`DOU/GRU/GIG/CGH/BSB/JFK/MIA`), com coordenadas
  fixas hardcoded — ver "Comportamento de domínio";
- **mapa navegável por teclado** (marcadores focáveis, `aria-live` de
  seleção): decisão deliberada de não construir — ver "Segurança e
  privacidade"/"Critérios de aceitação" pra o raciocínio de acessibilidade;
- **provider de mapa pago** (Mapbox/Google Maps): usuário aprovou
  especificamente OpenStreetMap + Leaflet para esta fatia;
- **paginação/clustering de marcadores**: não necessário na escala atual (no
  máximo 7 marcadores, um por aeroporto suportado);
- **geocoding dinâmico**: as coordenadas são uma tabela fixa, não uma
  integração de geocoding.

## Atores e autorização

Mesmo de SPEC-015 — página pública, sem autenticação.

## Entradas e validação

Nenhuma entrada nova — o mapa consome exatamente a mesma resposta de
`GET /v1/opportunities` (SPEC-015) já renderizada na página, sem chamada de
API adicional. `?view=map` é só um parâmetro de UI no frontend, não chega à
API.

## Comportamento de domínio e invariantes

### Coordenadas: tabela fixa, não um catálogo real

`apps/web/src/lib/domain/airport-coordinates.ts` — um
`Record<string, {lat, lng, label}>` com os 7 códigos já suportados por
`apps/api/src/watches/supported-catalog.ts`. Terceira cópia da mesma lista
fixa (depois daquele arquivo e do `SUPPORTED_AIRPORTS` de
`apps/web/src/app/watches/new/new-watch-form.tsx`) — documentada como
provisória, não como um catálogo de `Destination` real. As coordenadas em
si são fatos públicos (localização de aeroportos grandes conhecidos), não
dado de terceiro licenciado — diferente do que um catálogo real de
`Destination` precisaria (geodados versionados e licenciados,
`docs/roadmap/04-domain-and-platform-evolution.md`).

### Um marcador por destino, não por oportunidade

Oportunidades com o mesmo `destination` compartilham um marcador; o popup
mostra o menor preço entre elas ("a partir de"). Clicar um marcador
seleciona a oportunidade mais barata daquele destino.

### Estado de seleção é local, não um parâmetro de URL

`selectedId` vive em `useState` dentro de `OpportunitiesClient` (client
component pai que envolve toolbar + mapa + lista). Clicar um marcador seta
`selectedId` e rola a lista até o card correspondente
(`scrollIntoView`) — sem round-trip de navegação por clique. O toggle
Lista/Mapa em si, e a ordenação (herdada de SPEC-015), continuam sendo
parâmetros de URL (`?view=map`, `?sort=...`) — compartilháveis, com suporte
a botão voltar, mesmo padrão de `/search`.

### `ssr: false` obrigatório

Leaflet toca `window`/`document` na importação — `OpportunityMap` é
carregado via `next/dynamic(() => import('./opportunity-map'), {ssr:
false})`. Isso só é permitido dentro de um Client Component no App Router
(por isso o `dynamic()` fica em `opportunities-client.tsx`, não em
`page.tsx`, que é Server Component). Confirmado em smoke test ao vivo:
`GET /opportunities?view=map` retorna `200`, sem erro de servidor — o log
de "Bail out to client-side rendering: next/dynamic" no HTML de
desenvolvimento é o comportamento esperado e documentado do
Next.js para `ssr: false`, não uma falha.

### CSS do Leaflet escopado à rota

`apps/web/src/app/opportunities/layout.tsx` importa
`leaflet/dist/leaflet.css` — escopado a este segmento de rota via layout
próprio, não carregado em nenhuma outra página que nunca mostra o mapa.

### Ícone de marcador próprio, sem asset de imagem

O ícone default do Leaflet referencia arquivos de imagem por caminho
relativo que não resolve sob bundlers (Webpack/Turbopack) — problema
conhecido de react-leaflet + Next.js. Em vez de reconfigurar
`L.Icon.Default`, um `L.divIcon` com um ponto simples via CSS (sem
dependência de asset nenhuma).

## Contrato de API/evento/job

Nenhum — puramente frontend, consumindo o contrato já existente de SPEC-015.

## Persistência e migrações

Nenhuma.

## Idempotência e concorrência

N/A — sem efeito colateral, sem escrita.

## Modos de falha e retries

Se os tiles do OpenStreetMap falharem ao carregar (rede, indisponibilidade),
o mapa fica com tiles em branco, mas a lista (sempre renderizada,
independente do mapa) continua totalmente funcional — nenhum dado
essencial depende do mapa carregar.

## Segurança e privacidade

- mapa é `aria-hidden="true"`: decisão deliberada, não uma omissão. A lista
  é a via primária e completa (funciona sem mapa/JS); tornar cada marcador
  do Leaflet navegável por teclado seria engenharia significativa e de
  risco real de ficar mal feito. "O mapa nunca deve exigir que o usuário
  decifre uma visualização para encontrar o botão de compra"
  (`03-visual-and-ux-direction.md`) — com a lista sempre visível e completa,
  esse requisito já é satisfeito sem depender do mapa;
- nenhuma URL de terceiro além dos tiles do OpenStreetMap
  (`tile.openstreetmap.org`) e a atribuição obrigatória (`© OpenStreetMap
contributors`) está presente no mapa;
- nenhum dado pessoal no mapa — só rota/preço/destino, os mesmos já
  públicos em SPEC-015.

## Observabilidade

Nenhuma métrica nova — o mapa não faz chamada de API própria (consome o
resultado já buscado por `page.tsx`). Interação de mapa (clique em
marcador) não é instrumentada nesta fatia — `map_interaction_total{action}`
(citado em `04-domain-and-platform-evolution.md`) fica para uma fase
futura, se justificado por uso real.

## Performance e orçamento de custo

No máximo 7 marcadores (um por aeroporto suportado) — sem necessidade de
clustering. Tiles do OpenStreetMap: uso conforme a política de tile usage
do OSM (ver "Questões em aberto") — aceitável no volume atual (ambiente de
desenvolvimento/piloto), não avaliado para produção em escala.

## Critérios de aceitação

- AC-001: `/opportunities` mostra um toggle Lista/Mapa;
- AC-002: a lista continua completa e funcional independente do modo de
  visualização (nunca escondida atrás do mapa);
- AC-003: alternar para Mapa preserva os filtros/ordenação já aplicados
  (`sort`) — confirmado em smoke test ao vivo (link de ordenação inclui
  `&view=map` quando o mapa está ativo);
- AC-004: clicar um marcador destaca visualmente o card correspondente na
  lista e rola até ele;
- AC-005: nenhuma chamada de API adicional acontece ao alternar entre
  Lista e Mapa (mesmo dado já buscado por `page.tsx`);
- AC-006: o mapa nunca impede a lista de ser usada — todo link de compra e
  botão "Monitorar" continuam acessíveis via lista, mapa nunca é o único
  caminho.

## Testes e evals

Sem Playwright configurado neste ambiente (confirmado nas fatias
anteriores) — verificação por `pnpm -w typecheck`/`pnpm -w lint`/
`pnpm -w build` (compilação/SSR corretos, incluindo o caso `ssr: false` do
Leaflet) e smoke test ao vivo via curl contra o servidor de desenvolvimento
real (`next dev`), confirmando `200` em `/opportunities` e
`/opportunities?view=map`, e que os links de ordenação preservam `view=map`.
Sem verificação visual manual em navegador — documentado como gap, mesmo
padrão de SPEC-014/015/018.

## Rollout, rollback e kill switch

Sem migração, sem endpoint novo, sem feature flag — mudança inteiramente
aditiva na página `/opportunities` já existente (SPEC-015). Rollback é
reverter o deploy.

## Questões em aberto

- **política de uso de tiles do OpenStreetMap**: uso gratuito é sujeito à
  política de tile usage do projeto OSM (limite razoável de volume,
  atribuição obrigatória — já presente). Não avaliado para tráfego de
  produção em escala; se o volume crescer, considerar um provider de tiles
  dedicado (self-hosted ou pago) antes de produção real;
- **tabela de coordenadas provisória**: as três cópias da lista de 7
  aeroportos (`apps/api/src/watches/supported-catalog.ts`,
  `apps/web/src/app/watches/new/new-watch-form.tsx`,
  `apps/web/src/lib/domain/airport-coordinates.ts`) deveriam colapsar numa
  fonte só quando um catálogo real de `Destination` existir;
- **mapa sem navegação por teclado**: decisão deliberada documentada acima,
  mas vale revisitar se uma auditoria de acessibilidade real apontar
  necessidade;
- **`map_interaction_total`**: métrica prevista no doc de domínio, não
  implementada nesta fatia por falta de caso de uso concreto ainda.

## Evidência de implementação

Status: implementado e verificado em 2026-09-22.

### Arquivos principais

- `apps/web/package.json` — `leaflet@^1.9.4`, `react-leaflet@^5.0.0`,
  `@types/leaflet@^1.9.22` (dev).
- `apps/web/src/lib/domain/airport-coordinates.ts` (novo) — tabela fixa dos
  7 aeroportos.
- `apps/web/src/app/opportunities/layout.tsx` (novo) — importa o CSS do
  Leaflet escopado à rota.
- `apps/web/src/app/opportunities/opportunity-map.tsx` (novo) — componente
  Leaflet real, `aria-hidden`, ícone próprio via `L.divIcon`.
- `apps/web/src/app/opportunities/opportunity-map.module.css` (novo).
- `apps/web/src/app/opportunities/opportunities-client.tsx` (novo) —
  estado de seleção, toggle Lista/Mapa, `dynamic(ssr:false)`.
- `apps/web/src/app/opportunities/opportunity-card.tsx` (editado) — prop
  `selected` para o destaque visual.
- `apps/web/src/app/opportunities/page.tsx` (editado) — delega
  lista+mapa+toggle para `OpportunitiesClient`; links de ordenação
  preservam `view=map`.
- `apps/web/src/app/opportunities/page.module.css` (editado) — classes do
  toggle e do destaque de card selecionado.

### Comandos executados (resultado real)

- `pnpm --filter @flight-watch/web typecheck` — 1 erro real encontrado e
  corrigido no caminho (`exactOptionalPropertyTypes`/`noUncheckedIndexedAccess`
  em conflito com `MapContainerProps.className`, resolvido com
  `styles.map ?? ''`).
- `pnpm -w typecheck` — 20/20 pacotes ok.
- `pnpm -w lint` — 13/13 pacotes ok.
- `pnpm -w test` — 20/20 tasks ok (nenhum teste novo de frontend — sem
  convenção de teste de componente neste projeto ainda, confirmado via
  ausência de arquivos `*.test.tsx`).
- `pnpm -w build` — 13/13 tasks ok; `/opportunities` compila sem erro de
  SSR do Leaflet.

### Smoke test ao vivo (processo `next dev` real, sem mock)

1. `GET http://localhost:3100/opportunities` → `200`, HTML contém
   "Promoções", "Lista", "Mapa", contagem real de oportunidades.
2. `GET http://localhost:3100/opportunities?view=map` → `200`, sem erro de
   servidor (a string "Bail out to client-side rendering: next/dynamic" no
   HTML de desenvolvimento é o comportamento documentado e esperado do
   `ssr: false`, não uma falha — confirmado por status `200`).
3. Links de ordenação em `?view=map` confirmados incluindo `&view=map`
   (`/opportunities?sort=lowest_price&view=map`, etc.) — "ao abrir mapa,
   preservar os filtros da lista" verificado de ponta a ponta.

Verificação visual real (marcadores aparecendo corretamente posicionados,
popup ao clicar, destaque do card ao selecionar) não foi feita — sem
ferramenta de browser neste ambiente. Documentado como gap explícito, não
como testado.
