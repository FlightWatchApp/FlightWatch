# ADR-001 — Monólito modular com processos separáveis

Status: aceito para v0.1  
Data: 2026-09-17

## Contexto

O produto reúne gestão de usuários, monitoramentos, consultas externas, histórico, alertas e notificações. Parte da carga é HTTP e parte é assíncrona. Existe ambição de escala, mas ainda não existem dados reais de volume, equipe, custo ou gargalos que justifiquem microserviços.

## Decisão

Adotar um monorepo e um monólito modular, com limites explícitos entre Identity, Monitoring, Pricing, Alerting, Notifications e Operations.

API, scheduler, price worker, notification worker e outbox publisher serão processos implantáveis e escaláveis separadamente, embora compartilhem pacotes, banco e ciclo de versão no início.

Módulos expõem contratos públicos. Não é permitido importar repositórios internos, tabelas ou serviços privados de outro módulo para contornar esses contratos.

## Motivos

- reduz complexidade operacional e transações distribuídas;
- facilita TDD, refatoração e execução local;
- mantém escala horizontal onde ela é necessária: workers;
- preserva fronteiras que permitem extração posterior;
- reduz custo cognitivo para uma equipe inicial pequena.

## Consequências positivas

- uma única base de código e pipeline;
- mudanças de domínio podem ser transacionais;
- observabilidade e padrões compartilhados;
- implantação inicial mais simples.

## Consequências negativas

- falhas de modelagem podem criar acoplamento interno;
- banco compartilhado exige disciplina de ownership;
- deploy de um módulo pode exigir publicação do conjunto;
- uma dependência pesada pode afetar o artefato global.

## Salvaguardas

- testes de arquitetura impedem imports proibidos;
- módulos possuem pastas, APIs e owners claros;
- workers são entrypoints próprios;
- tabelas têm ownership documentado;
- contratos e eventos são versionados.

## Alternativas rejeitadas

### Microserviços desde o início

Rejeitados pela ausência de necessidade comprovada e pelo custo de rede, observabilidade, versionamento, segurança e consistência distribuída.

### Aplicação única com um único processo

Rejeitada porque consultas e notificações precisam escalar, reiniciar e limitar recursos independentemente da API.

## Gatilhos para revisão

- equipes autônomas com cadências incompatíveis;
- requisito comprovado de isolamento de falhas ou segurança;
- módulo com perfil de escala incompatível que processos separados não resolvem;
- banco compartilhado como gargalo mensurado;
- necessidade de implantação independente com impacto material no negócio.

Extração de serviço exige novo ADR com dados do gargalo e plano de migração.
