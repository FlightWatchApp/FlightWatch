# AGENTS.md — `apps/web`

Regras desta pasta, além das do [`AGENTS.md` da raiz](../../AGENTS.md).
Next.js 16 (App Router), React 19, CSS Modules. O web é um BFF: fala só com a
API (`API_BASE_URL`), nunca com banco, fila ou provedor de voo. Detalhe
visual: `docs/DESIGN-SYSTEM.md`.

## Receita: página nova

1. `src/app/<rota>/page.tsx` como Server Component; dados pela API com as
   funções de `src/lib/api/<área>.ts` (que usam `apiFetch` de
   `lib/api/client.ts` — repassa sessão e IP do cliente).
2. Mutação por Server Action em `src/app/<rota>/actions.ts` (`'use server'`),
   traduzindo o `code` do erro da API em texto para a pessoa
   (modelo: `lib/api/watch-errors.ts`).
3. Componentes em `src/components/<área>/`, reaproveitando `components/ui`;
   estilos em `*.module.css` só com tokens.
4. Estados: carregando, vazio, erro, desatualizado e sem oferta, cada um com
   a sua tela.
5. Página logada: checar a sessão no servidor; página de admin: o layout de
   `app/admin` já devolve 404 a quem não é admin.
6. Verificar: `pnpm check:design`, `pnpm screenshot /rota` (desktop e celular;
   olhar os prints) e, se for jornada importante, um teste em `apps/e2e/tests/`.

## Regras

1. Cor só por token de `src/styles/tokens.css`; componentes de `components/ui`.
2. Em `*.module.css`, animação é `var(--keyframes-*)` ou `@keyframes` do próprio
   módulo (o nome global some sem erro).
3. Data e hora no cliente com fuso fixo (`DISPLAY_TIME_ZONE`); data de viagem em
   UTC — formatar no fuso local quebra a hidratação.
4. Link de compra só pelo `PurchaseButton`, sempre com `PurchaseNote` na página.
5. Todo preço mostra a idade (`Freshness`); sem oferta é "—", nunca zero.
6. Texto: "último preço observado", "menor preço observado pelo sistema".
   Proibido: "menor preço do mercado", "garantido", "tempo real", "desconto"
   (`check-copy` confere).
7. Nenhum texto abaixo de 12 px; alvos ≥ 24 px (≥ 44 px no celular); sem
   rolagem horizontal em 320 px. Teclado e foco visível funcionam.
8. Movimento curto e com significado; movimento reduzido termina no estado final.
9. Variável lida no build vai no `env` do `build` (`turbo.json`) e como `ARG` no
   `Dockerfile` (H15); variável `NEXT_PUBLIC_*` é pública por definição.
10. `pnpm check:design` é catraca: baixar o teto que melhorou, nunca subir sem
    decisão.
11. Mapa (Leaflet): só pelos componentes de `components/route` ou das
    oportunidades, que já trazem o CSS e o isolamento sob o cabeçalho.
