# SPEC-040 — Painéis pessoais na página da oferta e na home logada

Status: draft — aguardando revisão do owner
Owner: Discovery
Dependências: SPEC-008 (ciclo do Watch), SPEC-032/034 (promoções e vitrine),
SPEC-038 (página da oferta), SPEC-039 (alerta de preço baixo, `lowPrice`)
Pedido do owner: conversa de 2026-10-14, com o mockup "Home Logado"

## Objetivo

Para quem está logado, a página **"Ver oferta"** (e a home logada) mostra,
ao lado da oferta, o que o sistema já sabe da pessoa: os monitoramentos
ativos, um resumo do que o Flight Watch fez por ela, promoções para os
destinos que ela acompanha e o atalho para buscar uma nova passagem. Cada
painel só aparece quando há dado para ele — quem acabou de se cadastrar vê
pouco, quem usa muito vê tudo.

## Decisões a confirmar (owner)

- **D1** Onde: na página da oferta (logado) **e** na home logada, com os
  mesmos componentes. Na página da oferta, numa coluna lateral no desktop e
  abaixo da oferta no celular.
- **D2** "Cidade de origem cadastrada": hoje a cidade escolhida fica só num
  cookie do navegador. Proposta: guardar na conta (`homeCityCode`), editável
  em "Minha conta" e preenchida quando a pessoa escolhe "Saindo de" logada.
  Vale em qualquer aparelho. É um dado pessoal leve (cidade, não endereço) e
  entra na Política de Privacidade.
- **D3** Números do resumo: **só o que o sistema sabe de verdade** (ver
  "Resumo"). "Passagens compradas" e "Economia estimada" do mockup **não**
  entram: a compra acontece no site do parceiro e não volta ligada à pessoa,
  então seriam números inventados (CLAUDE.md §22).

## Fora do escopo

- Recomendação por IA ou "o sistema entendendo as escolhas" além de regras
  simples e explicáveis (CLAUDE.md §2.2).
- Saber se a pessoa comprou (exigiria integração de conversão do parceiro).
- Editar regras de alerta (SPEC-039: o usuário não escolhe).

## Painéis

Todos são componentes do servidor, lidos de dados que já existem (exceto
D2). A ordem é a do mockup.

### 1. Monitoramentos ativos

- Aparece com **1 ou mais** monitoramentos ativos ou pausados.
- Até 3, primeiro os que estão **bem abaixo do normal** (SPEC-039), depois os
  mais recentes; cada um com rota, último preço, preço normal e estado
  ("Observando", "Bem abaixo do normal", "Pausado"), levando a
  `/watches/{id}`.
- "Ver todos" quando houver mais de 3.

### 2. Resumo (no lugar de "Seu histórico")

Só números que o banco tem, cada um com o rótulo exato do que é:

| Número                   | De onde vem                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Monitoramentos ativos    | Watches `ACTIVE`                                                                                                                      |
| Alertas enviados         | `AlertEvent` `NOTIFIED` dos Watches da pessoa                                                                                         |
| Abaixo do normal agora   | Watches ativos com preço no limite do `lowPrice` (SPEC-039)                                                                           |
| Maior queda que avisamos | maior `(preço normal − preço do alerta)` entre os alertas de preço baixo enviados, em reais e %; "abaixo do normal", nunca "economia" |

- Aparece com **1 ou mais** monitoramentos; cada número só aparece se for
  maior que zero (nada de "0 alertas" ocupando espaço).

### 3. Promoções para os seus destinos

- **Destinos da pessoa** = destinos dos monitoramentos (ativos e
  encerrados nos últimos 90 dias). Regra fixa e explicável, sem IA.
- Promoções em cache (SPEC-032/034, só leitura — nunca chama a fonte) que
  **chegam** num desses destinos, saindo da cidade da pessoa (D2) ou de
  qualquer cidade da vitrine.
- Até 3 cartões (`PromotionCard`, com "Ver oferta"); sem nenhuma, o painel
  não aparece.
- Título: "Promoções para os seus destinos". Sem a palavra "favoritos"
  enquanto não houver favorito explícito.

### 4. Buscar nova passagem

- Sempre aparece para quem está logado: texto curto e botão "Buscar
  passagem" (`/search`), com a cidade da pessoa já preenchida quando houver
  (D2).

### Estados

| Situação da pessoa                     | O que aparece                     |
| -------------------------------------- | --------------------------------- |
| Recém-cadastrada, sem monitoramento    | só "Buscar nova passagem"         |
| Com monitoramentos                     | + monitoramentos ativos e resumo  |
| Com destinos que têm promoção no cache | + promoções para os seus destinos |
| Visitante (não logado)                 | nenhum painel pessoal             |

## Contrato da API

- `GET /v1/me/overview` (autenticado): `homeCity` (`{ code, name }` ou
  null), `activeWatches` (até 3, mesmo formato resumido da listagem, com
  `lowPrice`), `activeCount`, `alertsSent`, `belowTypicalNow`,
  `biggestDrop` (`{ amountMinor, percent, route, date }` ou null),
  `destinationPromotions` (até 3, formato do `/v1/promotions/highlights`).
  Uma chamada por página; só banco e cache, nunca a fonte de preços.
- `PATCH /v1/me` (autenticado): `{ homeCityCode: string | null }`, validado
  no catálogo (SPEC-029). Rate limit `auth` como as outras rotas da conta.
- Schemas Zod em `packages/contracts`.

## Persistência

- `User.homeCityCode String?` (migração aditiva). Na exclusão da conta
  (SPEC-027), volta a `null` junto com os demais dados.
- Nada mais novo: os números vêm de `watches`, `alert_events` e do cache de
  promoções.

## Privacidade

- Política de Privacidade: incluir "cidade de partida que você escolher"
  entre os dados da conta (com o mesmo uso: mostrar promoções saindo dela).
- O resumo e os destinos são vistos só pela própria pessoa (mesma
  autorização dos monitoramentos).

## Desempenho

- `GET /v1/me/overview`: consultas agregadas por usuário (contagens e
  máximo), sem N+1; promoções só do Redis.
- A página da oferta pública continua igual para visitantes (sem custo
  extra); para quem está logado, uma chamada a mais.

## Observabilidade

- `me_overview_requests_total{panels}` — quantos painéis apareceram
  (`0`–`4`), para ver se as pessoas chegam a usar os painéis.

## Critérios de aceitação

- **AC-1** Visitante não vê nenhum painel pessoal; logado sem monitoramento
  vê só "Buscar nova passagem".
- **AC-2** Com monitoramentos, aparecem os ativos (até 3, os abaixo do
  normal primeiro) e o resumo, só com números maiores que zero.
- **AC-3** Nenhum número de compra ou economia realizada é mostrado.
- **AC-4** Promoções para os destinos só aparecem quando o cache tem alguma
  chegando num destino da pessoa; nunca chamam a fonte.
- **AC-5** A cidade gravada na conta vale em outro navegador e preenche a
  busca; "Minha conta" permite trocar ou apagar.
- **AC-6** Excluir a conta apaga a cidade.
- **AC-7** Página da oferta e home logada usam os mesmos painéis; no
  celular, abaixo do conteúdo principal, sem rolagem horizontal.

## Testes

- API (e2e, Postgres real): overview com usuário novo, com monitoramentos,
  com alertas enviados (maior queda), com promoção em cache para o destino;
  `PATCH /v1/me` com cidade válida, inválida e null; exclusão de conta.
- Web: painéis nos estados da tabela; E2E (Playwright) do usuário novo e do
  usuário com monitoramento.
- Navegador: desktop e celular, teclado, sem erro no console.

## Rollout e rollback

- Migração aditiva (`homeCityCode`). Sem kill switch próprio: os painéis só
  leem dados; rollback é reverter o deploy (a coluna pode ficar).

## Perguntas em aberto

1. D1, D2 e D3 acima.
2. "Destinos da pessoa": incluir também os destinos das ofertas que ela
   abriu? (Exigiria guardar visitas — não recomendo agora.)

## Evidência de implementação

Ainda não implementada.
