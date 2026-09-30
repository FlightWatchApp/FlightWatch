# Visão pós-MVP — inspirada no FlightConnections.com

Status: rascunho de ideias, **não é spec**.
Objetivo: não perder o raciocínio de uma sessão de análise do FlightConnections.com antes de vocês estruturarem specs/evals formais para esta fase.

## 1. Limite deste documento

Isto não substitui o fluxo normal do projeto (`AGENTS.md` §1: ler spec completa, `DOMAIN.md` e ADRs relacionados antes de implementar). É só um backlog de ideias, para consulta quando cada item virar spec de verdade — aí a spec vira a fonte da verdade, não esta lista.

O gatilho para revisitar isto era: depois que os specs já em andamento fecharem — **já fechou** (SPEC-008 e SPEC-009, ver §2), então as ideias abaixo estão liberadas para virar specs de verdade quando fizer sentido.

## 2. O que já temos (fundação sólida, não precisa redesenhar)

- SPEC-001 a SPEC-009 implementados, com testes reais contra Postgres (Testcontainers) e observabilidade (ADR-007, métricas + logs estruturados). SPEC-008 (pausar/reativar/encerrar) e SPEC-009 (histórico de preço com gráfico) fecharam os dois itens que este documento apontava como próximo passo.
- Modelo de domínio com `Watch`/`SearchTarget`/`AlertRule`/`PriceObservation`, com dedup de pesquisas equivalentes entre usuários (ADR-005) — um ativo de dado que o FlightConnections não tem equivalente, porque o produto deles é conectividade de rotas, não preço agregado.
- Autenticação real (email+senha, sessão em cookie httpOnly via BFF — ADR-006/SPEC-007).
- `apps/web` em Next.js **já tem um design system real** (`apps/web/src/styles/tokens.css`): paleta navy/paper com pares checados contra WCAG AA, tipografia própria (Fraunces para display, Public Sans para corpo, IBM Plex Mono para código de rota), componentes de UI consistentes (`Button`, `Card`, `StatusTag`, `InlineAlert`, ícones). A afirmação anterior deste documento ("sem identidade visual definida") estava errada — não tinha sido conferido o CSS de verdade antes de escrever. A tela de histórico (SPEC-009) foi construída reaproveitando esses tokens, não criando um sistema novo.

## 3. O que o FlightConnections faz melhor

Análise feita em cima do HTML/CSS público do domínio (a URL `/pt/` específica devolveu 404, mas a raiz carrega, e a própria página de erro deles já expôs o design system deles no markup/CSS embutido):

- **Identidade visual madura**: paleta navy (`#1C1D2E`) + branco, tipografia Inter, ícones Font Awesome consistentes em todo o produto.
- **Mapa interativo** como peça central da experiência — visualização geográfica rica, com legenda codificada por cor (densidade de destinos por aeroporto).
- **Painel de filtros denso mas bem organizado em abas** (Datas, Preços, Companhias, Aeronaves, Alianças) — muito conteúdo, sem parecer poluído.
- **Painel de conta unificado** (slide-out): idioma, moeda, trocar senha/e-mail, login social conectado (Google/Apple/Microsoft), assinatura — tudo num só lugar, não espalhado em páginas soltas.
- **Freemium por cota de uso visível** ("Map loads used", com barra de progresso), não por trava de feature core.
- **Estratégia de conteúdo estático para SEO**: páginas de aeroportos por país, por código IATA, mapas de rota por companhia/aliança — motor de tráfego orgânico de cauda longa.
- App mobile promovido via QR code; programa de afiliados de viagem.

**O que eles têm mas não faz sentido replicar**: o mapa de conectividade de rotas em si exige uma base de malha aérea/aeroportos/companhias que não é o nosso produto — nosso dado forte é preço observado ao longo do tempo, não conectividade.

## 4. Ideias adaptadas pro nosso diferencial (preço, não conectividade)

### 4.1 Identidade visual do `apps/web` — já existe, feito

~~Definir paleta, tipografia e espaçamento~~ — já existe em `apps/web/src/styles/tokens.css`, ver §2. O que resta nessa linha não é criar do zero, é estender: por exemplo `IconUser`/`IconLogOut` já existem em `components/ui/icon.tsx` mas ainda não são usados em nenhum lugar (candidatos naturais para o painel de conta de 4.4).

### 4.2 Histórico com gráfico de verdade — feito (SPEC-009)

Implementado: `GET /v1/watches/:id` devolve `priceHistory`, renderizado em `apps/web/src/components/watches/price-history-chart.tsx` como um SVG de linha (sem biblioteca nova — poucas dezenas de pontos não justificava a dependência). Mostra último preço, menor preço, série temporal e linha pontilhada de meta, reaproveitando os tokens existentes.

### 4.3 "Mapa" adaptado a preço, não a conectividade

- Visão dos monitoramentos do próprio usuário com indicador visual de tendência (caindo/subindo/estável) — mesmo padrão de codificação por cor deles, aplicado ao nosso dado real em vez de densidade de rotas.
- Página pública agregada: "rotas com maior queda de preço observada", usando `SearchTarget` compartilhado (ADR-005) de forma anônima — sem expor nenhum dado de usuário. É diferencial de produto (eles não têm preço) e potencial motor de aquisição/SEO ao mesmo tempo, no mesmo espírito das páginas estáticas deles.

### 4.4 Navegação e organização de conteúdo

- Painel de conta unificado (perfil, trocar senha/e-mail, canais de notificação) num só lugar, em vez de espalhado em páginas soltas.
- Tela de detalhe do monitoramento organizada por seções/abas (visão geral, histórico, regras de alerta, canal) em vez de tudo despejado numa página — mesmo princípio de "muito conteúdo, mas organizado" do painel de filtros deles.

### 4.5 Freemium com cota visível

`PRODUCT.md` §10 já tem a hipótese de monetização (plano grátis limitado, pago com mais monitoramentos/prioridade/canais/histórico). A contribuição da inspiração é o _padrão de UI_: uma barra de progresso mostrando quanto do limite já foi usado, em vez de só bloquear com mensagem de erro na hora de criar (hoje é isso que `WATCH_LIMIT_REACHED` faz).

### 4.6 Aquisição orgânica (SEO)

Páginas estáticas por rota (ex.: "GRU → LIS: histórico de preço") alimentadas pelos dados reais já coletados — depende de 4.3 (página pública agregada) existir primeiro.

### 4.7 Fricção de cadastro — avaliar com cautela

Login social (Google) reduz fricção de registro, mas SPEC-007/ADR-006 já fecharam email+senha como mecanismo desta fase, e `AGENTS.md` §8 exige revisão humana explícita pra qualquer mudança de autenticação. Não é algo pra virar spec sem decisão sua primeiro — registrado aqui só como ideia observada, não como próximo passo.

## 5. O que vimos mas fica de fora, deliberadamente

- Mapa de conectividade de rotas (não é o nosso dado, não é o nosso produto).
- Anúncios display.
- Programa de afiliados de hospedagem/passagem — esbarra no não-objetivo "não vender, reservar ou emitir passagens / não atuar como agência de viagens" do `PRODUCT.md` §6.
- Multi-idioma/multi-moeda — ideia real, mas escopo grande à parte; não bloqueia o diferencial de monitoramento.

## 6. Ordem sugerida daqui pra frente

1. ~~Ciclo de vida do monitoramento~~ — feito (SPEC-008).
2. ~~Histórico com gráfico~~ — feito (SPEC-009); identidade visual não precisou nascer junto porque já existia (§2).
3. Painel de conta unificado + organização em seções da tela de detalhe (4.4).
4. Cota visível de freemium (4.5) — depende de decisão de produto sobre limites reais; `PRODUCT.md` §10 ainda é hipótese, não decisão.
5. Página pública agregada de quedas de preço + SEO por rota (4.3 + 4.6) — maior escopo, é uma adição real ao `PRODUCT.md` §5 (hoje não é objetivo listado ali), então merece registro explícito no produto antes de virar spec.
