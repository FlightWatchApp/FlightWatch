# 03 — Spec das páginas

Uma seção por rota. "Imagem" aponta para `referencia-visual/` do pacote
(`-d` = 1440 px, `-m` = 390 px). Toda página segue DS, MO, BR e usa os
componentes de `02-spec-componentes.md`; aqui fica só o que é próprio dela.

Regras comuns a todas as páginas:

- **PG-00.1** Um `h1` por página. `SiteHeader` e `SiteFooter` vêm do layout.
  O link "Pular para o conteúdo" leva a `#main-content`.
- **PG-00.2** Estados distintos e com texto próprio: carregando (skeleton),
  vazio, erro de consulta, sem oferta, dado velho, expirado (H04). Nenhum deles
  mostra `R$ 0,00`.
- **PG-00.3** Toda página com `PurchaseButton` mostra `PurchaseNote` (CP-06).
- **PG-00.4** Blocos de página entram com `.reveal` escalonado (0, 80, 160,
  200 ms). Listas não animam item a item.
- **PG-00.5** Sem rolagem horizontal em 320, 390 e 1440 px; nenhum erro no
  console com o navegador em `America/Sao_Paulo`.

## PG-01 Início para visitante (`/`, sem sessão)

Imagem: `01-home-d.png`, `01-home-m.png`. Componente: `components/home/landing.tsx`.

1. **Hero** em duas colunas (uma no celular): sobrelinha "Monitoramento de
   passagens aéreas"; `h1` "Passagens observadas de perto."; texto "O Flight
   Watch acompanha o preço das rotas, aponta as promoções de verdade com base
   no histórico e leva você direto ao site parceiro para comprar."; botões "Ver
   promoções de hoje" (primário, `/opportunities`) e "Buscar passagens"
   (secundário, `/search`); nota "Grátis para buscar e ver promoções. Crie
   conta só para receber alertas." À direita, `HeroIllustration` (CP-14).
2. **Promoções agora**: até 3 `DealCard` `compact` de
   `GET /v1/opportunities?sort=best_value`, link "Ver todas →" e um
   `PurchaseNote` abaixo da grade.
3. **Como funciona**: três passos (Busque ou escolha uma promoção; Monitore o
   preço; Compre no parceiro).
4. **Confiança**: "Preço com data, promoção com motivo", texto que diz que não
   prometemos o preço mais baixo de todos os sites, link "Como ganhamos
   dinheiro →".
5. **Faixa final** petróleo: "Receba o aviso quando o preço cair", botão "Criar
   conta grátis".

Critérios:

- Dado o feed de promoções falhando, quando a página carrega, então ela
  aparece inteira e a seção 2 mostra "Nenhuma rota está abaixo do padrão neste
  momento…" (a falha do feed não derruba a home).
- Dado feed vazio, então a mesma mensagem, sem cartões vazios.
- Dado 390 px, então o hero vira uma coluna e a ilustração vem depois do texto.

## PG-02 Painel (`/`, com sessão)

Imagem: `03-painel-d.png`, `03-painel-m.png`. Arquivo: `app/page.tsx`.

- `EmailVerificationBanner` quando o canal não está verificado.
- Cabeçalho: `h1` "Seus monitoramentos"; resumo "6 em acompanhamento · 4
  atingiram o preço desejado" (a segunda parte só quando > 0); botão "Criar
  monitoramento".
- Duas colunas no desktop (monitoramentos | promoções), uma abaixo de 1080 px.
  Grid com `minmax(0, 1fr)`.
- Monitoramentos: `WatchCard` ativos e pausados; "Encerrados e expirados (N)"
  num `<details>`. Sem nenhum: `EmptyState` "Nenhum monitoramento ainda" com
  "Criar meu primeiro monitoramento".
- Coluna "Promoções agora": 2 `DealCard` `compact`, "Ver todas", `PurchaseNote`;
  vazio: "Nenhuma rota abaixo do padrão neste momento."

Critérios:

- Dado um Watch com preço ≤ preço desejado, então o cartão mostra "Preço
  desejado atingido" e o resumo conta esse Watch.
- Dado um Watch sem observação, então "—" e "Aguardando a primeira
  verificação".
- Dado 320 px, então nada vaza na horizontal.

## PG-03 Promoções (`/opportunities`)

Imagem: `02-promocoes-d.png`, `02-promocoes-m.png`. Arquivos:
`app/opportunities/page.tsx`, `opportunities-client.tsx`.

- Cabeçalho: sobrelinha "Promoções identificadas pelo sistema"; `h1`
  "Passagens abaixo do padrão agora"; subtítulo que explica a comparação com o
  histórico.
- Ordenação por links (funciona sem JavaScript): Melhor valor, Menor preço,
  Mais recente, Menor duração; o atual com `aria-current`.
- Alternador Lista/Mapa (SPEC-016), 44 px no celular. Mapa entra com
  `.reveal`; selecionar um marcador destaca o `DealCard` (`selected`) e rola até
  ele.
- Lista de `DealCard` completos (com `PurchaseNote` em cada, CP-08).
- Vazio: `EmptyState` "Nenhuma promoção agora" com a explicação de que falta
  histórico.

Critérios:

- Dado JavaScript desligado, então a lista e a ordenação funcionam.
- Dado "Monitorar preço" e confirmação com preço válido, então um Watch é
  criado e a pessoa vai para o detalhe; preço inválido mostra "Informe um
  preço desejado válido, maior que zero." sem fechar o modal.

## PG-04 Busca (`/search`)

Imagem: `05-busca-d.png`, `05-busca-m.png`. Arquivos: `app/search/page.tsx`,
`search-form.tsx`.

- Faixa petróleo com brilho do destino e `h1` "Para onde você quer ir?";
  cartão do formulário sobreposto à faixa (`--shadow-lg`).
- Linha da rota: Origem, `IconButton` "Inverter origem e destino", Destino.
  Opções exibidas como "GRU · São Paulo/Guarulhos" (`airportLabel`).
- Linha de detalhes: tipo de viagem, ida, volta (só ida e volta), passageiros,
  cabine. Botão "Buscar passagens" `lg` com `loading`.
- `PurchaseNote` abaixo do formulário.

Critérios:

- Dado origem igual ao destino, quando envia, então "Origem e destino precisam
  ser diferentes." e nenhuma chamada à API.
- Dado envio válido, então o botão mostra carregamento até o redirecionamento
  para `/search/:id`.
- Dado o rate limit da API (SPEC-014), então a mensagem de erro existente
  aparece no formulário.

## PG-05 Resultado da busca (`/search/[id]`)

Imagem: `06-resultado-d.png`, `06-resultado-m.png`.

- Cabeçalho com `RouteLine` `lg` e cidades, datas e número de ofertas.
- Lista de `OfferCard` (CP-16); a primeira mais barata com "Mais barata desta
  busca". `PurchaseNote` abaixo.
- Sem ofertas: `EmptyState` "Nenhuma oferta encontrada". Busca que falhou
  mostra o `InlineAlert` de erro, não o estado vazio.

## PG-06 Detalhe do monitoramento (`/watches/[id]`)

Imagem: `04-detalhe-d.png`, `04-detalhe-m.png`.

- Cabeçalho: `RouteLine` `lg` com cidades e `animated`, `StatusTag`, datas.
  Abaixo de 640 px o cabeçalho usa `column-reverse` para o selo não cobrir o
  destino.
- Painel de preço (fixo ao rolar no desktop): "Último preço observado" com o
  valor; destaques; `dl` com "Menor preço observado" e "Preço desejado";
  `Freshness`; `PurchaseButton` `lg` `fullWidth` com `watchId`;
  `PurchaseNote`; ações de ciclo de vida.
- A linha "Última verificação …" aparece só quando não há oferta atual, o
  Watch está inativo ou o dado está velho (senão repetiria o `Freshness`).
- Painel do gráfico: `h2` "Histórico de preço", subtítulo "O eixo não começa em
  zero", `PriceHistoryChart`.

Critérios:

- Dado Watch sem oferta atual, então não há botão de compra e aparece o estado
  "sem oferta" com a última verificação.
- Dado oferta expirada, então o botão diz "Atualizar preço" e o `Freshness`
  fica âmbar.
- Dado Watch de outra pessoa, então 404 como hoje (autorização não muda).

## PG-07 Novo monitoramento (`/watches/new`)

Imagem: `09-novo-d.png`, `09-novo-m.png`.

- Cartão com formulário: origem e destino com `airportLabel`, datas, "Preço
  desejado" (rótulo e mensagens de erro usam esse termo), botão `lg` com
  `loading`.
- Erro da API aparece como `InlineAlert` sem perder o que foi digitado.

## PG-08 Conta (`/login`, `/register`, `/verify-email`)

Imagem: `07-entrar-*.png`, `08-cadastro-*.png`.

- `/login` e `/register` usam `AuthShell` (CP-13). Títulos "Entrar" / "Criar
  conta grátis"; subtítulos "Acesse seus monitoramentos e promoções." /
  "Monitore rotas e receba um e-mail quando o preço chegar ao valor que você
  quer pagar."
- `/verify-email`: ícone com `pop` (40 px), "E-mail confirmado" ou "Não foi
  possível confirmar".
- Comportamento de autenticação não muda (SPEC-007, SPEC-010, ADR-006).

## PG-09 Transparência (`/transparencia`)

Imagem: `10-transparencia-d.png`, `10-transparencia-m.png`. Página nova
(SPEC-020).

- `h1` "Como ganhamos dinheiro" e quatro seções: "Quem vende a passagem", "Links
  de afiliado", "O que é uma promoção aqui", "Por que o preço pode mudar".
- Texto verificável e sem promessa: o Flight Watch não vende nem emite
  passagem; alguns links rendem comissão sem custo extra; promoção é o menor
  preço observado pelo sistema na rota ou um preço bem abaixo da média
  observada; preço muda a qualquer momento e é confirmado no parceiro.
- Linkada do rodapé, do bloco de confiança da home e de todo `PurchaseNote`.
- Metadado `title` "Como ganhamos dinheiro".
