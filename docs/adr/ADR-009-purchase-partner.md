# ADR-009 — Parceiro de destino do botão de compra

Status: aceito (owner, 2026-10-26)
Contexto de produto: `docs/specs/SPEC-044-purchase-partner.md`
Substitui, em parte: SPEC-038 D2/D3 (botão principal para a companhia aérea; "comparar em agências" com parceiro configurável)

## Contexto

O botão de compra levava à busca da **Aviasales**, porque a fonte de preços (Travelpayouts, ADR-008) é o cache da Aviasales e já vinha com o link. Pessoas que compraram a ideia do sistema disseram, em conversa com o owner, que **não confiam** nesse site e não colocariam dinheiro nele: o produto observa preço e depois manda a pessoa para um lugar desconhecido, o que quebra a promessa.

## Decisão

1. O destino do botão de compra é um **parceiro configurável**: `PURCHASE_PARTNER` (`provider` | `decolar`). `provider` mantém o comportamento anterior (link da própria fonte); `decolar` leva à busca da Decolar.
2. O link é **montado na hora, pela viagem** (`buildDecolarSearchUrl`, função pura no domínio), nunca lido do `deeplink` gravado na observação. O endereço gravado é sempre o da fonte; uma observação sem mudança de preço nem cria registro novo, e trocar o parceiro só no gerador deixaria links antigos no ar por semanas.
3. Todo link passa pela **allowlist** (`www.decolar.com`, chave `DECOLAR`) antes de sair, e só depois recebe afiliado (SPEC-020). Um único ponto decide: `resolvePartnerLink` (`apps/api/src/affiliate/purchase-links.ts`), usado pelas sete superfícies (monitoramento, busca, oportunidades, promoções, rota).
4. Voltar atrás é configuração (`PURCHASE_PARTNER=provider` e reiniciar a API), sem novo deploy de código.

## Formato do link da Decolar

Copiado de buscas reais feitas no site em 2026-10-26 (o teste reproduz os três endereços):

- só ida: `/shop/flights/results/oneway/{origem}/{destino}/{data}/{adultos}/0/0?from=SB&di={adultos}`
- ida e volta: `/shop/flights/results/multioneway/{origem}/{destino}/{ida}/{volta}/{adultos}/0/0?from=SB&di={adultos}&isRedirectFromRoundtrip=true`

Códigos são de **cidade** (SAO, RIO), os mesmos do catálogo (SPEC-029). O formato é do site, não de uma API documentada: pode mudar sem aviso. Se mudar, o link deixa de abrir a busca certa (cai na página inicial ou em erro), e a correção é uma função e um teste.

## Alternativas descartadas

- **Manter a Aviasales:** rejeitada pelo motivo de confiança acima.
- **Botão secundário "comparar" com a Aviasales** (SPEC-038 D3): não implementado; pode voltar depois como segundo botão.
- **Ir direto à companhia aérea** (SPEC-038 D2): continua sem resposta da Travelpayouts (F5) e exige links por companhia; não bloqueia esta decisão.
- **Reescrever os links gravados no banco:** observações são imutáveis (P13).

## Consequências e riscos (não resolvidos)

- **O preço pode não bater.** O preço mostrado vem do cache da Aviasales (várias agências); a Decolar pode mostrar outro valor ou não ter aquela tarifa. Mitigação decidida: o aviso "confirme o preço no parceiro" já existe, e o owner confere ~10 rotas à mão antes do lançamento. Se a diferença for grande, a decisão precisa ser revista.
- **Sem comissão por enquanto.** O programa da Decolar passa pela Awin (cerca de 2,5% por venda, último clique, cookie de 30 dias, não aceita pessoa física — conferir no painel). Até haver CNPJ e aprovação, o link é puro. A Awin usa um link "embrulhado" (`awin1.com/cread.php?...&ued=<url codificada>`), que o mecanismo atual de afiliado (parâmetros acrescentados à URL) **não** cobre: quando houver aprovação, é uma mudança própria (novo host na allowlist e um embrulhador).
- **Termos da Travelpayouts:** não foi encontrado texto que permita ou proíba usar os dados da Data API para enviar o cliente a outro site. As regras públicas permitem redirecionar tráfego para sites de programas afiliados. A Decolar não é parceira da Travelpayouts. Pendente: pergunta ao suporte, junto com a de F5.
- **Textos do site** ("podemos receber comissão", página de transparência) são genéricos e continuam verdadeiros como possibilidade; devem ser revistos quando a decisão sobre afiliado da Decolar for tomada. Nomear a Decolar no botão e no aviso é o próximo passo de confiança.
- **Ida e volta** usa `multioneway` porque foi o que o site produziu; se isso mostrar tarifas de duas passagens separadas, o total pode diferir de uma ida e volta única. Confirmar na conferência manual.
