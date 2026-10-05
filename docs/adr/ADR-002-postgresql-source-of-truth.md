# ADR-002 — PostgreSQL como fonte de verdade

Status: aceito para v0.1  
Data: 2026-09-17

## Contexto

O sistema precisa de unicidade forte para deduplicação, transações na criação de Watch, histórico auditável, consultas relacionais e idempotência. Redis será utilizado para filas, cache e coordenação, mas esses usos não devem tornar dados de domínio voláteis.

## Decisão

Usar PostgreSQL como fonte de verdade para entidades, estados, observações, eventos de alerta, entregas, cotas persistidas e outbox.

Valores monetários serão inteiros em unidade mínima. Timestamps serão armazenados com timezone/UTC. Identificadores internos usarão UUID. Integridade essencial será reforçada por constraints e índices, não apenas pela aplicação.

## Motivos

- transações ACID;
- índices únicos para fingerprints e chaves idempotentes;
- bom suporte a séries de observações e consultas operacionais;
- ecossistema maduro de backup, réplica e monitoramento;
- reduz quantidade de tecnologias persistentes no início.

## Consequências positivas

- consistência e auditoria centralizadas;
- outbox transacional no mesmo commit;
- recuperação do estado mesmo após perda do Redis;
- modelo operacional conhecido.

## Consequências negativas

- `price_observations` pode crescer rapidamente;
- consultas históricas mal desenhadas podem competir com escrita;
- particionamento e retenção podem se tornar necessários.

## Salvaguardas

- índices definidos a partir dos padrões de consulta;
- paginação por cursor para históricos;
- retenção e agregação avaliadas com dados reais;
- réplicas de leitura e particionamento somente quando justificados;
- backups testados e objetivos de recuperação documentados antes de produção.

## Alternativas rejeitadas

### Redis como estado principal

Rejeitado pelo risco de perda, menor adequação para histórico/auditoria e complexidade de reconstrução.

### Banco de séries temporais desde o início

Rejeitado porque o volume ainda é desconhecido e aumentaria a operação. Poderá ser reavaliado para analytics, sem retirar PostgreSQL do núcleo transacional.

### Banco NoSQL principal

Rejeitado porque as garantias de unicidade, relacionamentos e transações são centrais ao domínio.

## Gatilhos para revisão

- custo ou latência de observações fora do SLO após otimização;
- retenção em escala que torne o armazenamento inadequado;
- necessidade analítica que prejudique carga transacional;
- requisito multi-região com escrita ativa comprovado.
