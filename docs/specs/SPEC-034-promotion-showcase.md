# SPEC-034 — Vitrine de promoções e cidade sugerida pelo acesso

Status: approved (owner, 2026-10-13) — passo 5 do `MVP-CHECKLIST.md`
Owner: Discovery
Dependências: SPEC-029 (catálogo de lugares), SPEC-032 (promoções por
origem), SPEC-033 (página da rota)

## Objetivo

Quem chega ao site **sem ter escolhido cidade já vê promoções reais**, como
numa agência de viagens, em vez do cartão de exemplo e de uma seção vazia.
Decisão do owner: além da cidade da pessoa, uma vitrine geral a partir das
cidades mais usadas do Brasil — cada cartão diz de onde sai.

## Decisões do owner (2026-10-13)

- **D1** Cidades da vitrine: `SAO, RIO, BSB, BHZ, POA, CWB, SSA, REC, FOR, CGR`
  (configuráveis em `PROMOTION_SHOWCASE_ORIGIN_CITIES`; nenhuma lista no código).
- **D2** A cidade pode ser **sugerida pelo acesso** (IP), sem guardar nada,
  só para escolher o que mostrar primeiro. A pessoa troca quando quiser.

## Fora do escopo

Banner editorial/campanhas, fotos de destino, carrossel com rolagem
automática, hotéis e pacotes.

## Comportamento

### API — `GET /v1/promotions/highlights?limit=`

- Público, rate limit `pages` (como a página da rota): é chamada a cada
  visita sem cidade e só lê cache. `limit` padrão 12, máximo 30.
- Junta os feeds **já em cache** das cidades de
  `PROMOTION_SHOWCASE_ORIGIN_CITIES` — **nunca calcula nem chama a fonte**: a
  página não espera cálculo e robôs não gastam cota.
- **Uma promoção por destino** (a de maior score entre as origens), ordenadas
  por score; preço com mais de 72 h fica fora (SPEC-030). Cada item traz a
  origem (`origin`, `originName`) além do formato do `/v1/promotions`.
- Motor desligado → `status: "DISABLED"`, lista vazia. Sem cidades
  configuradas → `OK` com lista vazia.

### Aquecimento

- A API recalcula os feeds das cidades da vitrine no startup e a cada
  `PROMOTION_SHOWCASE_REFRESH_MINUTES` (padrão 180), em sequência, pelo mesmo
  caminho do `/v1/promotions`: cache fresco não chama a fonte; orçamento
  diário, Retry-After e single-flight da SPEC-032 valem igual.
- Custo: até ~31 chamadas por cidade fria; com 10 cidades e cache de 6 h,
  cabe no orçamento padrão (2000/dia).
- Mais de uma réplica da API aquece em paralelo; o cache torna o segundo
  aquecimento barato (aceito na v1).

### Web

- **Sem cidade** (nem cookie, nem sugestão): o cartão do topo mostra a
  melhor promoção da vitrine, com "Saindo de …"; a seção "Promoções agora"
  vira **"Destaques do Brasil"** com as seguintes. O exemplo rotulado só
  aparece se a vitrine estiver vazia.
- **Com cidade**: como hoje (SPEC-032) e, abaixo, "Destaques do Brasil" sem
  repetir destinos já mostrados.
- Todo cartão mostra a origem.
- **`/opportunities`** (owner, 2026-10-14): sem cidade, além do pedido de
  cidade, mostra "Destaques do Brasil". A vitrine também aparece quando a
  cidade escolhida não tem promoção ou a fonte falhou; com promoções da
  cidade, não aparece.

### Cidade sugerida pelo acesso

- Fonte: o cabeçalho `cf-ipcity` (+ `cf-ipcountry`) que a **Cloudflare**
  acrescenta com "visitor location headers" ligado. Sem Cloudflare (ex.:
  local), não há sugestão — a página segue com a vitrine.
- Só país `BR`; o nome da cidade é procurado no catálogo (SPEC-029); sem
  correspondência, sem sugestão.
- **Nada é gravado** (nem cookie): a sugestão vale para aquela visita. O
  campo "Saindo de" mostra a cidade com o aviso "Sugerida pelo seu acesso —
  troque se quiser". Escolher grava o cookie de sempre.
- Cabeçalho forjado só muda a sugestão de quem forjou: sem risco.
- A Política de Privacidade (passo 9) deve citar esse uso.

## Observabilidade

`promotion_highlights_requests_total{result}` (`ok`, `empty`, `disabled`);
log `promotion_showcase_warmed` (cidades, promoções, duração) a cada
aquecimento. Cidade não vira label.

## Configuração

`PROMOTION_SHOWCASE_ORIGIN_CITIES` (lista; vazia = vitrine desligada) e
`PROMOTION_SHOWCASE_REFRESH_MINUTES` (180), na API, em `packages/config` e
`.env.example`.

## Critérios de aceitação

- **AC-1** Destaques juntam só feeds em cache, uma promoção por destino, por
  score, sem chamar a fonte.
- **AC-2** Aquecimento calcula os feeds das cidades da vitrine e respeita o
  cache (segunda rodada com cache fresco: 0 chamadas).
- **AC-3** Visitante sem cidade vê promoções reais no cartão do topo e em
  "Destaques do Brasil", cada uma com a origem.
- **AC-4** Com `cf-ipcity` de uma cidade do catálogo, a página usa a cidade
  sugerida, sem gravar cookie, e diz que é sugestão.
- **AC-5** Motor desligado ou vitrine vazia: página igual à de hoje.

## Testes

Seleção dos destaques (pura, no domínio); e2e da API (destaques, sem
chamada à fonte, aquecimento, desligado); leitura do cabeçalho (pura, no
web); verificação no navegador (desktop e celular), com o cabeçalho simulado.

## Rollout e rollback

Sem migração. Liga ao configurar `PROMOTION_SHOWCASE_ORIGIN_CITIES` (com o
motor ligado); desliga esvaziando a variável.

## Evidência de implementação

2026-10-13, branch `feat/showcase` (sobre a `main` com PR #8).

- Domínio: `selectHighlights` (4 testes: um por destino, ordem, 72 h, vazio).
- API: `GET /v1/promotions/highlights` (só cache, limite `pages`),
  `warmShowcase` no startup e a cada `PROMOTION_SHOWCASE_REFRESH_MINUTES`,
  métrica `promotion_highlights_requests_total{result}`, logs
  `promotion_showcase_warmed`/`promotion_showcase_warm_failed`. 3 e2e novos
  (aquecimento e leitura sem chamar a fonte, cache fresco sem chamada,
  vazio, desligado, `limit` inválido) — promoções 16/16, API 208/208.
- Web: cartão do topo pela vitrine sem cidade, "Promoções saindo de …" e
  "Destaques do Brasil" sem repetir destinos, cidade sugerida por
  `cf-ipcity`/`cf-ipcountry` (`visitorCityFromHeaders`, 4 testes) procurada
  no catálogo, sem cookie. Texto de "Como funciona" deixou de dizer
  "histórico" (as promoções comparam datas próximas). Web 109.
- E2E (Playwright, stack simulada): 10/10, inclusive vitrine sem cidade e
  sugestão pelo acesso sem cookie; `smoke` e `promotions` atualizados para o
  comportamento novo (SPEC-034 substitui "sem origem, pede a cidade").
- Gates: lint 15/15, typecheck 23/23, `check:design`, domínio 250.
- **Execução real** (Travelpayouts, 10 cidades): aquecimento em 20 s, 18
  promoções, nenhuma falha; vitrine com 10 destinos sem repetição (ex.:
  Salvador → São Paulo R$ 404, −49%). Navegador (desktop 1326 px e celular
  390 px): sem cidade → cartão real e 6 destaques; `cf-ipcity` Campo Grande →
  reconhecida, sem promoção, aviso e vitrine; Salvador → seção da cidade;
  nenhum cookie gravado, nada fora da tela, sem erro no console.
- **Não verificado:** a Cloudflare real enviando os cabeçalhos (depende do
  deploy atrás da Cloudflare com "visitor location headers" ligado).
- 2026-10-14, `/opportunities` com a vitrine: E2E 13/13 (teste novo em
  `promotions.spec.ts`); navegador com dados reais (desktop e celular): 9
  destaques, sem rolagem horizontal, sem erro no console.
