# SPEC-044 — Botão de compra leva à Decolar (parceiro configurável)

Status: implemented (código e testes) — aguardando a conferência manual do owner (§ Evidência)
Owner: Pricing
Dependências: SPEC-018 (link validado por allowlist), SPEC-020 (afiliado), SPEC-029 (códigos de cidade), SPEC-038 (páginas de oferta), ADR-008, ADR-009
Origem: conversa de 2026-10-26 — clientes que compraram a ideia do sistema não confiam no site de destino anterior (Aviasales).

## Objetivo

O botão "Comprar passagem" (e "ver todos os voos") leva à **busca da Decolar** com origem, destino, datas e passageiros já preenchidos. Voltar ao comportamento anterior é só configuração.

## Fora do escopo

- Afiliado da Decolar (precisa de CNPJ e aprovação na Awin; o embrulho `awin1.com` é uma mudança à parte — ADR-009).
- Nomear a Decolar no botão e no aviso de compra; rever os textos de comissão.
- Ir direto à companhia aérea (SPEC-038 F5, depende da Travelpayouts).
- Crianças e bebês (o sistema só trabalha com adultos), classe de cabine (só econômica).
- Mudar a fonte de preços.

## Comportamento

- `PURCHASE_PARTNER` (config da API, padrão `provider`; `decolar` no modelo de produção). Interruptor: voltar a `provider` e reiniciar a API.
- Em `decolar`, todo `purchaseUrl` e `allFlightsUrl` da API é `buildDecolarSearchUrl(viagem)`, validado em `www.decolar.com` (allowlist) e só então enviado. O `deeplink` gravado na observação é **ignorado**.
- Viagem inválida (código, data, passageiros, volta) → sem link (`null`), nunca um link quebrado; a interface já trata `null`.
- Em `provider`: nada muda (testes existentes seguem valendo sem alteração).
- Superfícies (todas por `resolvePartnerLink`): monitoramento (lista, detalhe e clique), busca (ofertas e "todos os voos"), oportunidades, promoções, página da rota e oferta do dia.
- Códigos são de cidade: GRU vira SAO ao criar o monitoramento (SPEC-029), que é o que a Decolar usa.

## Contrato

Nenhuma mudança de campos: `purchaseUrl` e `allFlightsUrl` continuam strings (ou `null`). Só o host e o formato mudam.

## Configuração

| Chave              | Padrão     | Observação                                                   |
| ------------------ | ---------- | ------------------------------------------------------------ |
| `PURCHASE_PARTNER` | `provider` | `provider` \| `decolar`; `.env.example` e modelo de produção |

## Segurança e privacidade

- Link montado só com valores validados (3 letras maiúsculas, `AAAA-MM-DD`, inteiro de 1 a 9); nada vem direto do usuário, e a allowlist confere o host de novo.
- Nenhum dado pessoal vai no link: só rota, datas e número de adultos.
- O botão mantém `rel="noopener noreferrer sponsored"` e abre em nova aba (check-purchase).

## Critérios de aceitação

- **AC-1** Os três endereços de busca copiados do site da Decolar são reproduzidos **exatamente** (só ida, ida e volta, 2 adultos). — `purchase-partner.test.ts`
- **AC-2** Dado inválido (código, data, passageiros, volta) devolve `null`, sem lançar.
- **AC-3** Em `decolar`, monitoramento (lista e detalhe) e busca (ofertas, `allFlightsUrl`, leitura por id) devolvem links da Decolar mesmo com `deeplink` gravado de outra fonte, e nenhum endereço da fonte aparece na resposta. — `purchase-partner.e2e.spec.ts`
- **AC-4** Em `provider`, o comportamento anterior e os testes existentes não mudam.
- **AC-5** O marker da Travelpayouts nunca é acrescentado a um link da Decolar; afiliado configurado para `DECOLAR` é aplicado só a ele.
- **AC-6** A lista de valores da configuração é igual à do domínio (teste).

## Rollout e rollback

1. Deploy com o código novo e `PURCHASE_PARTNER=provider` (nada muda).
2. Conferência manual do owner (abaixo). Depois `PURCHASE_PARTNER=decolar` e reiniciar a API.
3. Rollback: `PURCHASE_PARTNER=provider` e reiniciar a API. Nada é apagado.

## Perguntas em aberto (owner)

1. Diferença de preço entre o nosso valor e o da Decolar nas rotas principais (conferir ~10 rotas).
2. Resposta do suporte da Travelpayouts sobre direcionar o cliente a outro site.
3. CNPJ e cadastro na Awin para comissão.
4. Nomear a Decolar nos botões e avisos.

## Evidência de implementação

- Gerador puro `buildDecolarSearchUrl` com 17 testes, incluindo os três endereços reais (copiados da barra do navegador em 2026-10-26).
- `resolvePartnerLink` (9 testes) e e2e com banco real (`purchase-partner.e2e.spec.ts`, 2 testes). Prova inversa: com `PURCHASE_PARTNER=provider` os mesmos testes falham e mostram o endereço da fonte.
- **Não verificado por mim:** que a página que a Decolar abre para cada link gerado mostra a rota, as datas e os passageiros certos. A Decolar bloqueia consultas automáticas (HTTP 403); a conferência é manual, abrindo links gerados pelo sistema num navegador.
