# SPEC-045 — Monitorar qualquer viagem, contexto do preço e textos honestos

Status: implemented — Parte A (busca) e Parte B (mensagens para o grupo, admin)
Owner: Web / Pricing
Dependências: SPEC-014 (busca), SPEC-031 (calendário), SPEC-039 (alerta de preço baixo), SPEC-043 (admin), SPEC-044 / ADR-009 (parceiro de compra)
Origem: conversa de 2026-10-26. Clientes e o owner viram que o número do nosso site não bate com o da Decolar (a fonte é o cache de outra agência) e que, numa busca sem preço, não havia como monitorar.

## Objetivo

1. **Monitorar qualquer viagem pesquisada**, com ou sem preço.
2. Dar **contexto** ao preço mostrado (onde ele está entre o que observamos no mês), sempre "do que o sistema observou", nunca "do mercado".
3. **Textos honestos**: o botão diz para onde vai; o aviso explica que o site parceiro mostra os voos e valores de agora, que podem ser diferentes.

## Fora do escopo

- Lista de voos como a da Decolar: o dado atual é um preço por dia, sem voo identificado (ADR-008/009). Depende de outra fonte de dados.
- Voltar à página certa depois do login: exigiria `?next=` no login (mudança de autenticação, precisa de aprovação do owner). Quem não está logado vai ao login e refaz a escolha.
- Nomear a Decolar em todos os textos do site (só botões e avisos de compra).

## Parte A — Busca

### A1. "Monitorar esta viagem" em toda busca

- Bloco sempre presente nos resultados (com ofertas, sem ofertas e quando a fonte falhou), com o botão "Monitorar esta viagem".
- O botão leva a `/watches/new?origin=SAO&destination=RIO&tripType=ONE_WAY&departureDate=AAAA-MM-DD[&returnDate=AAAA-MM-DD]`. O formulário abre com cidades (nome resolvido pelo catálogo, SPEC-029), tipo de viagem e datas preenchidos; a pessoa confere e confirma. A origem do pré-preenchimento ganha da cidade da conta.
- Os parâmetros da URL são só sugestão: cada um é validado (3 letras maiúsculas, `AAAA-MM-DD`, volta depois da ida, tipo conhecido), o inválido é ignorado e o formulário fica em branco naquele campo. Quem valida de verdade continua sendo a API.
- Sem preço, o bloco diz a verdade: "Mesmo sem preço hoje, você pode monitorar: avisamos quando aparecer um preço bom. Rotas pouco procuradas têm poucos preços na nossa fonte, e o aviso pode demorar ou não chegar."

### A2. Contexto do preço

- Abaixo do calendário, uma frase compara o menor preço da busca com a **mediana dos preços observados no mês** (os dias do calendário): "Este preço está 34% abaixo da mediana dos 23 preços que observamos neste mês: R$ 484,00."
- Só com **8 ou mais** dias observados (igual às promoções, SPEC-032); com menos, não opina. Diferença de até 5% é "em linha". Cálculo em inteiros na menor unidade (CLAUDE.md §8.1).

### A3. Textos

- Botões de compra nomeiam o parceiro quando o reconhecem pelo endereço (host exato): "Ver voos na Decolar" / "Ver preço atual na Decolar" / "Ver todos os voos na Decolar". Parceiro desconhecido (ex.: fonte simulada): os rótulos de antes.
- `PurchaseNote`: "O preço aqui é o que observamos: o site parceiro mostra os voos e valores de agora, que podem ser diferentes. Você finaliza a compra lá. Podemos receber comissão, sem custo extra para você."
- Página "Como ganhamos dinheiro": nova seção "Por que o valor no site parceiro pode ser diferente do nosso" (o nosso vem de uma fonte de preços observados, geralmente com horas ou dias de idade, sem voo específico).

## Parte B — Mensagens para o grupo de WhatsApp (admin)

`/admin/mensagens?origin=SAO` (só admin; 404 para os demais, como o resto de `/admin`): lista as 10 melhores promoções de uma cidade de partida (`GET /v1/promotions`, a mesma da home) e, para cada uma, o texto pronto para a pessoa responsável colar no grupo, com o botão "Copiar mensagem". **Nada é enviado.**

Formato (WhatsApp, `*negrito*` e `_itálico_`): rota; "Só ida · 20/11/2026 · Direto"; preço com "NN% abaixo da mediana dos N preços que observamos (R$ X)" só quando há queda; "Visto há N h" (ou dias); o link do parceiro (já validado pela API; sem link, a linha some); e o aviso "o site mostra os voos de agora e o valor pode ser diferente. Confirme o valor antes de comprar". Mesmas regras de linguagem do site: nada de "menor preço do mercado", "garantido", "tempo real", "desconto".

Código de cidade da URL inválido volta para SAO; motor de promoções desligado, orçamento do dia esgotado, feed vazio e erro da consulta têm mensagem própria.

## Critérios de aceitação

- **AC-1** `buildWatchPrefillHref` e `parseWatchPrefill`: ida de volta exata; parte inválida ignorada sem lançar; volta antes da ida descartada. — `trip-prefill.test.ts`
- **AC-2** `describePriceContext`: abaixo/em linha/acima com percentual e mediana; menos de 8 dias → `null`; inteiros. — `price-context.test.ts`
- **AC-3** `purchasePartnerName` reconhece só host exato. — `purchase-partner-name.test.ts`
- **AC-4** Com e sem ofertas, a busca mostra "Monitorar esta viagem", que abre o formulário com a viagem preenchida e dali o monitoramento é criado; parâmetros inválidos não quebram a página. — `search-monitor.spec.ts` (e2e)
- **AC-5** `pnpm check:design` e `pnpm check:web-js` dentro dos tetos; nenhuma frase proibida.
- **AC-6** `buildGroupMessage`: só ida e ida e volta, escalas, idade em horas e dias, sem link sai sem a linha do link, sem desconto não afirma "abaixo", nenhuma frase proibida. — `group-message.test.ts`
- **AC-7** Quem não é admin recebe 404 em `/admin/mensagens`; o admin vê as mensagens com o botão de copiar. — `admin-messages.spec.ts` (e2e)

## Segurança e privacidade

- A URL de pré-preenchimento só carrega códigos e datas já públicos; nada pessoal. O que chega pela URL é validado antes de preencher e depois de novo pela API.
- Nenhum endereço de parceiro novo: os links continuam saindo da API pela allowlist (SPEC-018).

## Rollout e rollback

Só interface; sem migração nem configuração. Rollback: reverter o PR.

## Evidência de implementação

- Testes: 16 novos de domínio do web (pré-preenchimento 7, contexto 6, parceiro 3) e 2 e2e no navegador; suíte do web 145, e2e 19/19. (A mensagem do commit anterior diz 18: o certo é 16.)
- Vista nos prints (desktop e celular) de uma busca com preço e outra sem: botão "Ver todos os voos na Decolar", aviso novo, frase de contexto ("34% abaixo da mediana dos 23 preços…") e o bloco de monitorar nos dois casos; formulário aberto com Campo Grande (CGR), Manaus (MAO), ida e volta e as duas datas.
- Parte B: 6 testes de domínio e 1 e2e (admin criado pelo comando do servidor); e2e inteiro 20/20. Vista na tela (desktop e celular) com promoções reais de São Paulo: Joinville, Foz do Iguaçu, Uberlândia, Florianópolis, cada uma com o link da Decolar.
- Não verificado: o fluxo para quem **não** está logado termina no login (limitação declarada acima). O botão "Copiar mensagem" usa a área de transferência do navegador; o teste confere que ele existe, não o conteúdo copiado.
