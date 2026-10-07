# SPEC-017 — Pacotes de viagem

Status: rascunho para aprovação  
Dependências: SPEC-014 e fonte autorizada para hospedagem ou composição

## Objetivo

Apresentar uma viagem composta por voo e hospedagem, com preço e validade
explicáveis, sem fingir que o Flight Watch é uma agência ou um checkout.

## Fora do escopo

- reserva ou pagamento dentro do Flight Watch;
- combinação de fornecedores sem confirmação de disponibilidade;
- promessa de economia quando os componentes não são comparáveis;
- pacote gerado apenas por texto editorial sem preço real.

## Contrato mínimo

Cada `PackageOffer` deve conter:

- `id`, `sourceProvider`, `observedAt`, `expiresAt`;
- componentes individualizados: voo, hospedagem e opcionais;
- preço de cada componente, taxas conhecidas, total e moeda;
- datas, ocupação e regras de entrada usadas na consulta;
- política de cancelamento quando a fonte fornecer;
- link para o canal responsável por confirmar a compra;
- `qualityFlags` para dados ausentes ou estimados.

## Critérios de aceitação

- o total é reproduzível pela soma dos componentes exibidos;
- cada componente informa fonte e validade;
- pacote expirado é marcado como expirado e não como disponível;
- dados incompletos são visíveis, não escondidos no preço total;
- monitoramento de pacote só nasce em uma spec própria, depois de definir o
  que significa acompanhar componentes diferentes;
- compra e confirmação acontecem fora do Flight Watch nesta fase.

## Risco principal

Pacotes elevam muito a complexidade de disponibilidade, cancelamento, moedas e
responsabilidade comercial. Implementar primeiro com fixtures e um provedor
autorizado em sandbox; não conectar múltiplos fornecedores reais no mesmo
release inicial.
