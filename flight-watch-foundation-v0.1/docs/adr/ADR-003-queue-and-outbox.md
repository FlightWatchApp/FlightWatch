# ADR-003 — BullMQ, Redis e outbox transacional

Status: aceito para v0.1  
Data: 2026-09-17

## Contexto

Consultas de preço e notificações são lentas, falíveis, sujeitas a cota e inadequadas ao ciclo síncrono da API. Jobs podem ser entregues mais de uma vez. Também é necessário evitar o dual-write: confirmar uma mudança no banco e falhar antes de publicar o job correspondente.

## Decisão

Usar BullMQ sobre Redis para filas e PostgreSQL para uma outbox transacional.

Mudanças de domínio e respectivos eventos de outbox são gravados na mesma transação. Um publisher lê eventos pendentes, publica jobs e marca o resultado. Consumidores assumem semântica at-least-once e implementam idempotência persistente.

## Motivos

- fila madura no ecossistema TypeScript;
- suporte a retry, backoff, concorrência e rate limiting;
- separação entre API, scheduler e workers;
- outbox reduz perda de eventos entre banco e fila;
- operação inicial menos complexa que plataformas de streaming ou workflow.

## Regras

- cada job tem `schemaVersion`, `idempotencyKey` e `correlationId`;
- retry somente para falhas temporárias classificadas;
- backoff exponencial com jitter e limite;
- dead-letter não é apagada automaticamente;
- reprocessamento é autorizado, rastreado e idempotente;
- o payload contém apenas IDs e dados mínimos;
- conclusão de job não substitui persistência do resultado no PostgreSQL.

## Consequências positivas

- resposta rápida da API;
- escala independente de workers;
- controle explícito de pressão e cota;
- recuperação de eventos não publicados.

## Consequências negativas

- consistência eventual após o commit;
- duplicação é possível e precisa ser tratada;
- Redis passa a ser dependência operacional importante;
- outbox exige limpeza, métrica e reconciliação.

## Alternativas rejeitadas

### Chamar provedor no request HTTP

Rejeitado por latência, timeout, cota e baixa resiliência.

### Publicação direta sem outbox

Rejeitada pelo risco de dual-write e perda silenciosa.

### Kafka

Rejeitado por complexidade desproporcional ao estágio e por não eliminar a necessidade de idempotência.

### Temporal

Adiado. É candidato se surgirem workflows duradouros, estados de espera complexos, compensações e sinais humanos que tornem filas manuais difíceis de operar.

## Gatilhos para revisão

- workflows com múltiplas esperas e compensações difíceis de representar;
- volume/retention de eventos incompatível com a solução;
- necessidade comprovada de replay amplo e múltiplos consumidores independentes;
- custo operacional de reconciliação superior ao de uma engine durável.
