# ADR-005 — Deduplicação por SearchTarget canônico

Status: aceito para v0.1  
Data: 2026-09-17

## Contexto

Vários usuários podem monitorar a mesma combinação de origem, destino, datas, cabine, passageiros, moeda e mercado. Consultar o provedor para cada Watch multiplicaria custo e uso de cota sem produzir informação nova.

## Decisão

Separar `Watch`, intenção individual, de `SearchTarget`, consulta compartilhada. Parâmetros relevantes são normalizados em uma chave canônica versionada e resumidos por SHA-256. O banco mantém unicidade do fingerprint.

Criações concorrentes usam upsert e recuperam o mesmo SearchTarget. Watches preservam regras e canais individuais, mas recebem observações do target compartilhado.

## Inclusão na chave v1

- versão do schema;
- origem e destino IATA;
- datas de ida e volta;
- tipo de viagem;
- cabine;
- quantidade de adultos;
- moeda;
- mercado/ponto de venda.

Filtros que mudam o conjunto de ofertas somente entrarão na chave quando suportados. Preferências que apenas alteram o alerta ou a apresentação permanecem no Watch.

## Consequências positivas

- menos chamadas e menor custo;
- cache e histórico compartilháveis;
- escala ligada a targets únicos, não a usuários;
- scheduler prioriza uma unidade operacional clara.

## Consequências negativas

- erro na canonicalização pode misturar buscas diferentes;
- adicionar campo à chave pode fragmentar targets;
- um target popular pode gerar fan-out grande na avaliação de alertas;
- histórico anterior pode não ser totalmente aplicável a Watch recém-criado.

## Salvaguardas

- versão explícita da chave;
- testes baseados em propriedades para equivalência e diferença;
- armazenamento dos campos canônicos além do hash;
- constraint única no banco;
- fan-out assíncrono e paginado;
- política explícita sobre uso de observações anteriores à criação do Watch.

## Política inicial de histórico

O Watch pode exibir observações do SearchTarget dentro da janela permitida, mas regras relativas usam apenas observações a partir da ativação do Watch, salvo se a interface declarar outra referência explicitamente. Isso impede alertas inesperados baseados em histórico que o usuário não viu.

## Alternativas rejeitadas

### Uma consulta por Watch

Rejeitada por custo e uso de cota linear.

### Deduplicação apenas em cache

Rejeitada porque expiração ou perda do cache recriaria duplicatas persistentes.

### Chave montada informalmente na aplicação

Rejeitada por risco de ordem, casing, defaults e campos omitidos. A canonicalização deve ser função pura, versionada e testada.

## Gatilhos para revisão

- provedores retornarem resultados personalizados por usuário;
- exigência de filtros que alterem significativamente a oferta;
- fragmentação excessiva da chave;
- custo do fan-out maior que o benefício de compartilhamento.
