# SPEC-015 — Promoções e oportunidades

Status: rascunho para aprovação  
Dependências: SPEC-014 e histórico de preços confiável

## Objetivo

Mostrar oportunidades úteis mesmo quando o usuário ainda não tem um
monitoramento salvo.

## O que é uma oportunidade

Uma oportunidade é uma oferta ou conjunto de ofertas com uma explicação
determinística. Exemplos:

- preço abaixo do menor observado para aquela rota/período;
- preço percentual abaixo da referência recente;
- preço dentro de um orçamento configurado;
- janela curta de validade informada pela fonte;
- pacote com economia explicada sobre componentes separados.

O sistema deve dizer “menor preço observado por nossa fonte”, nunca “menor
preço do mercado” sem cobertura demonstrável.

## Feed

Filtros iniciais:

- origem;
- região/país/destino;
- período;
- preço máximo;
- ida/volta;
- escalas;
- atualização máxima;
- tipo de oportunidade.

Ordenação:

- melhor valor explicado;
- menor preço;
- mais recente;
- menor duração.

## Card obrigatório

```text
GRU → LIS                         observada há 8 min
12–19 jun · ida e volta · 1 escala
R$ 2.480                          31% abaixo da referência
Fonte: provider X · válida até 18:00
[Ver oferta] [Monitorar preço] [Comprar]
```

## Critérios de aceitação

- cada badge aponta para uma referência calculável;
- oportunidade expirada é removida ou marcada claramente;
- a home de usuário sem Watch não fica vazia;
- monitorar preserva rota, datas, passageiros e moeda;
- ofertas monitoradas mantêm o deep link e o preço observado no card do Watch;
- link expirado mostra aviso e não usa linguagem de preço garantido;
- nenhum ranking usa PII;
- ofertas sem preço reproduzível não recebem badge de promoção.
