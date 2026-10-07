# SPEC-018 — Compra a partir do monitoramento

Status: draft para aprovação
Owner: Monitoring
Dependências: SPEC-004, SPEC-009, `docs/roadmap/04-domain-and-platform-evolution.md`

## Objetivo

Permitir que o usuário abra o canal de compra da passagem que está sendo
monitorada diretamente pelo card do Watch, preservando o preço observado que
originou o link. Fecha o gap identificado em `docs/roadmap/`: o
dado (`PriceObservation.deeplink`/`expiresAt`) já existe no schema desde
SPEC-004, mas nunca foi projetado até a API nem até a interface — hoje
`SimulatedFlightProvider` nem chega a preencher esses dois campos, então a
lacuna é de ponta a ponta (provider simulado → repositório → contrato →
frontend).

Esta é a primeira fatia da "Fase 1" de `docs/roadmap/05-roadmap.md`
a ser implementada — adiantada em relação à busca completa (SPEC-014) porque
não depende tecnicamente dela: o dado de origem já existe, o gap é só de
projeção, contrato e frontend.

## Fora do escopo

- emissão, reserva, pagamento ou qualquer confirmação de compra dentro do
  Flight Watch — o Flight Watch nunca deixa de ser um observador que aponta
  para o canal externo autorizado;
- múltiplas ofertas por Watch (isso é escopo de SPEC-014, quando a busca
  interativa existir de verdade);
- suporte a qualquer provider além de `SIMULATED` — a validação de host é
  desenhada para múltiplos providers, mas só um existe hoje;
- alterar `PriceObservation` ou qualquer contrato de SPEC-003/004 além de
  popular campos que já existem e nunca foram preenchidos.

## Atores e autorização

- usuário autenticado, dono do Watch (`SessionAuthGuard` + a mesma checagem
  de ownership já usada em `GET /v1/watches`, `GET /v1/watches/:id` e nos
  verbos de lifecycle — SPEC-001/008/009);
- o registro de clique (§8) exige a mesma autenticação e ownership — não é um
  endpoint público, mesmo que o link de destino seja externo.

## Entradas e validação

Nenhuma entrada nova para os endpoints de leitura já existentes
(`GET /v1/watches`, `GET /v1/watches/:id`) — `currentOffer` passa a ser um
campo a mais na resposta que já existe.

Endpoint novo `POST /v1/watches/:id/purchase-click`: `:id` validado pelo mesmo
`WatchIdValidationPipe` de SPEC-008, sem corpo.

## Comportamento de domínio e invariantes

### Estado atual (confirmado no código antes de especificar)

`packages/providers/src/simulated/simulated-flight-provider.ts`'s
`defaultScenario` nunca preenche `deeplink` nem `expiresAt` na `FlightOffer`
que gera — logo `PriceObservation.deeplink`/`expiresAt` são sempre `null` no
banco hoje. Sem popular isso no simulado, a spec não teria nenhum dado real
para projetar nem testar. `defaultScenario` passa a gerar:

- `deeplink`: URL HTTPS determinística sob um host claramente simulado
  (`https://booking.simulated-provider.flightwatch.dev/checkout/<hash>`) —
  nunca um domínio real de companhia/OTA;
- `expiresAt`: `observedAt` + 1 hora, mesma ordem de grandeza usada como
  exemplo em `docs/roadmap/02-...md`.

### Projeção `currentOffer`

```text
PriceObservation (mais recente do SearchTarget, mesmo critério de
"preço atual" já usado por enrichWatch — sem o corte por watch.startsAt,
ver SPEC-009 §6 e o comentário already existente sobre essa assimetria
ser intencional)
  → watch-listing-repository.ts's enrichWatch
  → toWatchListItem / toWatchDetailResponse (apps/api)
  → WatchListItem.currentOffer (contrato)
  → WatchCard / página de detalhe (apps/web)
  → link externo com noopener,noreferrer
```

`currentOffer` é `null` quando não há `PriceObservation` para o
`SearchTarget`, ou quando ela existe mas `deeplink` é `null`/inválido.

### Validação do link antes de projetar (nova regra de domínio)

Nova função pura em `packages/domain` (`resolvePurchaseUrl`), mesma
disciplina de `isOfferEligible`: entrada não confiável (mesmo vindo do nosso
próprio banco — um provider real futuro pode gravar algo inesperado) nunca
chega ao frontend sem passar por:

1. `deeplink` precisa parsear como URL válida;
2. protocolo precisa ser exatamente `https:`;
3. host precisa estar na allowlist do `providerStrategy` da observação
   (hoje só `SIMULATED` → `booking.simulated-provider.flightwatch.dev`);
4. nunca aceitar `javascript:`, `data:`, `file:` ou qualquer URL montada a
   partir de entrada do usuário — não há entrada do usuário nesse caminho,
   mas a checagem de esquema cobre isso por construção.

Se qualquer checagem falhar, `currentOffer` é `null` — a falha é silenciosa
para o usuário (sem CTA quebrado), mas incrementa
`purchase_link_missing_total{provider}` (§8) para ficar visível em métricas.

### Status `CURRENT` vs `EXPIRED`

`status = 'EXPIRED'` quando `expiresAt` existe e já passou; caso contrário
`'CURRENT'`. Uma oferta `EXPIRED` continua sendo projetada (não vira `null`)
— o frontend usa o status para trocar o rótulo do CTA (`Atualizar preço` em
vez de `Comprar passagem`), nunca para esconder o dado.

## Contrato de API/evento/job

### `GET /v1/watches` e `GET /v1/watches/:id` (extensão, sem quebrar contrato)

Cada item ganha o campo `currentOffer`:

```json
{
  "currentOffer": {
    "amountMinor": 248000,
    "currency": "BRL",
    "purchaseUrl": "https://booking.simulated-provider.flightwatch.dev/checkout/...",
    "provider": "SIMULATED",
    "observedAt": "2027-03-10T12:00:00.000Z",
    "expiresAt": "2027-03-10T13:00:00.000Z",
    "status": "CURRENT"
  }
}
```

`currentOffer: null` quando não há observação ou o link não passa na
validação de §"Validação do link". `currentPrice` (campo já existente)
continua exatamente como está — `currentOffer` é aditivo, não substitui nada.

### `POST /v1/watches/:id/purchase-click` (endpoint novo)

Sem corpo. `204 No Content`. Autenticado, ownership obrigatória (mesmo padrão
de SPEC-008). Existe só para dar ao clique um evento de produto mensurável
antes do navegador abrir a aba externa — o frontend chama best-effort (não
bloqueia a navegação, não impede o clique se a chamada falhar).

## Persistência e migrações

Nenhuma migração de schema — `PriceObservation.deeplink` e `.expiresAt` já
existem desde SPEC-004. A mudança inicial é de projeção, contrato,
`SimulatedFlightProvider` e frontend, exatamente como o rascunho original já
apontava.

## Idempotência e concorrência

- leitura pura (`GET /v1/watches`, `GET /v1/watches/:id`) — sem efeito
  colateral, sem questão de idempotência;
- `POST /v1/watches/:id/purchase-click` incrementa um contador; chamar duas
  vezes (duplo clique, replay de rede) só incrementa a métrica duas vezes —
  aceitável, é telemetria de produto, não um efeito de domínio que precise
  ser exatamente-uma-vez.

## Modos de falha e retries

- `deeplink` ausente ou inválido: `currentOffer: null`, sem erro — não é uma
  falha de requisição, é um estado de dado legítimo (documentado em §"Estado
  atual");
- `POST /v1/watches/:id/purchase-click` falhando (rede, 5xx): o frontend não
  impede a abertura do link externo; é best-effort, não crítico ao fluxo do
  usuário.

## Segurança e privacidade

- autorização por ownership em `GET`/`POST` (reaproveita guard e padrão já
  em produção, SPEC-001/008);
- proteção SSRF/URL maliciosa: allowlist de host + esquema `https:`
  obrigatório antes de qualquer URL chegar à resposta HTTP (não é validação
  só no frontend);
- link externo abre com `noopener,noreferrer` (evita que a aba nova tenha
  acesso a `window.opener` da aplicação);
- nenhuma URL completa, token ou PII entra em log/métrica — labels usam só
  `provider` e `status` (baixa cardinalidade, CLAUDE.md §11.2).

## Observabilidade

- `watch_purchase_link_click_total{provider,status}` — incrementado por
  `POST /v1/watches/:id/purchase-click`, `status` reflete o `currentOffer`
  no momento do clique (`CURRENT`/`EXPIRED`);
- `purchase_link_missing_total{provider}` — incrementado toda vez que
  `enrichWatch` encontra uma `PriceObservation` mas o link não passa na
  validação (mede cobertura real, não só "existe deeplink no banco");
- log estruturado do clique com `watchId` e `provider`/`status`, nunca a URL
  completa.

## Performance e orçamento de custo

Mesma meta de SPEC-001 §14 (p95 abaixo de 500ms) — a projeção reaproveita a
mesma consulta de `latestObservation` que `enrichWatch` já fazia
(`GET /v1/watches`/`GET /v1/watches/:id` não ganham nenhuma consulta nova ao
banco, só mais campos do `select` já existente). `POST /purchase-click` é uma
única escrita de contador, sem consulta a mais.

## Critérios de aceitação

- AC-001: `GET /v1/watches` inclui `currentOffer` quando há deep link válido;
- AC-002: `GET /v1/watches/:id` mantém os mesmos dados do card e inclui
  `currentOffer`;
- AC-003: resposta de lifecycle (`POST .../pause|reactivate|cancel`) também
  inclui `currentOffer` (reaproveita a mesma projeção `WatchListItem`);
- AC-004: preço, moeda, fonte, observação e validade em `currentOffer` vêm do
  mesmo snapshot (`PriceObservation`), nunca recalculados/misturados;
- AC-005: Watch sem observação não exibe `currentOffer` quebrado — é `null`;
- AC-006: `deeplink` com host fora da allowlist ou esquema diferente de
  `https:` nunca chega à resposta HTTP — vira `currentOffer: null` e
  incrementa `purchase_link_missing_total`;
- AC-007: `expiresAt` no passado marca `status: 'EXPIRED'`, mas `currentOffer`
  continua presente (não vira `null`);
- AC-008: `POST /v1/watches/:id/purchase-click` de outro usuário retorna
  `404` (mesma política de não confirmar existência de SPEC-008);
- AC-009: troca de preço — uma nova `PriceObservation` mais recente muda
  `currentOffer` na próxima leitura, sem cache desatualizado;
- AC-010 (frontend): estado `CURRENT`, `EXPIRED` e ausente têm rótulo e CTA
  visualmente distintos; o link abre com `noopener,noreferrer`.

## Testes e evals

- e2e (Testcontainers) cobrindo AC-001 a AC-009, mesmo padrão de
  `watches.e2e.spec.ts`;
- teste unitário de `resolvePurchaseUrl` (packages/domain) cobrindo host
  válido, host inválido, esquema não-https, `javascript:`/`data:`, URL
  malformada, `deeplink` nulo;
- teste de frontend (ou verificação manual documentada, se Playwright não
  estiver configurado neste momento) cobrindo os três estados do card.

## Rollout, rollback e kill switch

Sem migração, sem feature flag dedicada — a mudança é aditiva em endpoints já
em produção (o campo novo é ignorado por qualquer cliente antigo que não o
leia). Rollback é reverter o deploy; nenhum dado é alterado de forma
destrutiva.

## Questões em aberto

- quando um provider real existir, a allowlist de host precisa crescer por
  ADR (não é uma decisão que esta spec toma sozinha — CLAUDE.md §21 marca
  "provider real" como algo que sempre exige aprovação humana explícita);
- o valor de `PROVIDER_DAILY_CHECK_BUDGET`/tempo de expiração de link real
  não existe ainda — o placeholder de 1h do simulado é só para ter dado
  plausível, não uma política de produto aprovada.

## Evidência de implementação

Status: implementado e verificado em 2026-09-21.

### Arquivos principais alterados

- `packages/domain/src/pricing/purchase-link.ts` (novo) — `resolvePurchaseUrl`
  (allowlist de host/esquema por provider) e `resolveCurrentOfferStatus`
  (`CURRENT`/`EXPIRED`); 12 testes em `purchase-link.test.ts`.
- `packages/providers/src/simulated/simulated-flight-provider.ts` —
  `defaultScenario` passa a popular `deeplink`/`expiresAt` (host
  `booking.simulated-provider.flightwatch.dev`, TTL de 1h); regressão em
  `simulated-flight-provider.test.ts`.
- `packages/database/src/watch-listing-repository.ts` — `LatestObservation`
  exportado com `deeplink`/`expiresAt`/`providerStrategy`; `enrichWatch`
  estende o `select` já existente (sem consulta nova).
- `packages/contracts/src/watches/list-watches.ts` — `currentOfferSchema` +
  `currentOffer` em `watchListItemSchema`.
- `apps/api/src/watches/watches.service.ts` — `toCurrentOffer()`, wired em
  `toWatchListItem`; `recordPurchaseClick()`; contagem de
  `purchase_link_missing_total` em `listWatches()`.
- `apps/api/src/watches/watches.controller.ts` — `POST
/v1/watches/:id/purchase-click` (204, guarded, `WatchIdValidationPipe`).
- `apps/api/src/observability/metrics.service.ts` —
  `watchPurchaseLinkClickTotal`, `purchaseLinkMissingTotal`.
- `apps/web/src/lib/api/types.ts`/`watches.ts`, `apps/web/src/app/watches/actions.ts`
  — tipo `CurrentOffer`, `recordPurchaseClick`/`recordPurchaseClickAction`.
- `apps/web/src/components/watches/purchase-link-button.tsx` (novo) — CTA
  client component (`<a target="_blank" rel="noopener noreferrer">`,
  rótulo por status, clique dispara telemetria best-effort sem bloquear a
  navegação); usado em `watch-card.tsx` e `app/watches/[id]/page.tsx`.

### Comandos executados (resultado real)

- `pnpm --filter @flight-watch/database build` (dist precisava dos novos
  campos do `select` para os demais pacotes tipar contra o formato novo).
- `pnpm -w typecheck` — 20/20 pacotes ok.
- `pnpm -w lint` — 13/13 pacotes ok (1 erro real encontrado e corrigido no
  caminho: `no-invalid-void-type` em `apiFetch<void>`, trocado para o padrão
  já usado em `auth.ts`, `apiFetch<undefined>`).
- `pnpm -w test` — 20/20 tasks ok; `apps/api` 96/96 testes (Testcontainers
  Postgres real), incluindo os 12 novos casos de e2e cobrindo AC-001 a
  AC-009 mais os cenários de autorização/validação de `purchase-click`
  (404 outro usuário, 404 inexistente, 400 id malformado, 401 sem token,
  204 + métrica no caminho feliz).
- `pnpm -w build` — 13/13 tasks ok (`apps/web` compila e gera as rotas
  estáticas/dinâmicas normalmente).

### Smoke test ao vivo (processos reais já em execução, sem mocks)

Contra `apps/api` (nodemon, porta 3000) e o pipeline completo
(scheduler/price-worker/alert-worker/notification-worker, todos `tsx watch`)
já rodando contra o Postgres/Redis do `docker-compose.yml`:

1. `POST /v1/auth/register` real, canal verificado via `UPDATE` direto no
   Postgres (mesmo padrão de `createVerifiedUserWithChannel` do e2e).
2. `POST /v1/watches` real — o scheduler (tick de 5s) pegou o Watch, o
   price-worker rodou o `SimulatedFlightProvider` real e gravou uma
   `PriceObservation` com `deeplink`/`expiresAt` populados de verdade (não
   seed manual): confirmado por leitura direta da tabela
   `price_observations`.
3. `GET /v1/watches` devolveu `currentOffer` completo e correto
   (`purchaseUrl` no host allowlisted, `status: "CURRENT"`), lido do
   mesmo snapshot que `currentPrice`.
4. `POST /v1/watches/:id/purchase-click` → `204`; `GET
http://localhost:9100/metrics` (porta dedicada de métricas, ADR-007)
   confirmou `watch_purchase_link_click_total{provider="SIMULATED",status="CURRENT"} 1`.
5. Casos negativos confirmados ao vivo: id malformado → `400
INVALID_WATCH_ID`; sem `Authorization` → `401`.
6. Efeito colateral não previsto, mas correto: o preço simulado (64472)
   já nasceu abaixo do `targetAmountMinor` (80000) do Watch de teste, então
   o `alert-worker`/`notification-worker` reais dispararam um
   `AlertEvent`/`NotificationDelivery` de verdade — o pipeline de SPEC-005/006
   segue funcionando com os dados agora populados pelo `SimulatedFlightProvider`.
   Isso exigiu limpar `alert_events`/`notification_deliveries` (FKs) além de
   `watches`/`alert_rules`/`notification_channels`/`users` ao remover os
   dados de teste do banco de desenvolvimento.

Frontend: sem Playwright configurado neste ambiente — verificação foi por
leitura de código (`purchase-link-button.tsx` reaproveita as classes de
`Button`, `<a>` real com `noopener,noreferrer`, rótulo condicional por
`currentOffer.status`) e pelos testes de tipo/build do Next (`pnpm -w build`
gerou as rotas normalmente). Verificação visual manual em navegador não foi
feita — documentado como gap, não como "testado".
