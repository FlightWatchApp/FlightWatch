# Flight Watch — Fundação de Engenharia v0.1

Status: proposta inicial para validação antes da implementação.

Este pacote define o produto, o domínio, a arquitetura, as decisões técnicas, os critérios de avaliação, os quality gates e as seis primeiras especificações do sistema de monitoramento de preços de passagens aéreas.

## Ordem de leitura

1. `PRODUCT.md`
2. `DOMAIN.md`
3. `ARCHITECTURE.md`
4. `docs/adr/`
5. `EVALS.md`
6. `QUALITY-GATES.md`
7. `AGENTS.md`
8. `docs/specs/`

## Regra de precedência

Em caso de divergência:

1. a spec da feature rege o comportamento daquela feature;
2. `DOMAIN.md` rege invariantes e regras transversais;
3. ADRs aceitos regem decisões arquiteturais;
4. `ARCHITECTURE.md` apresenta a visão consolidada;
5. `PRODUCT.md` rege escopo e objetivos de negócio.

Nenhuma divergência deve ser resolvida silenciosamente. O documento desatualizado deve ser corrigido no mesmo conjunto de alterações.

## Conteúdo

- `PRODUCT.md`: visão, público, MVP, jornadas, métricas e limites.
- `DOMAIN.md`: entidades, estados, regras, invariantes e glossário.
- `ARCHITECTURE.md`: componentes, fluxos, dados, segurança, escala e operação.
- `EVALS.md`: cenários objetivos de correção, custo, resiliência e segurança.
- `QUALITY-GATES.md`: condições obrigatórias para aceitar e publicar mudanças.
- `AGENTS.md`: regras operacionais para agentes de IA no repositório.
- `docs/adr/`: registros das decisões arquiteturais iniciais.
- `docs/specs/`: contratos das primeiras funcionalidades.

## Estado das decisões

Estão definidos: monólito modular, processos separáveis, PostgreSQL como fonte de verdade, Redis/BullMQ para filas, abstração de provedores, deduplicação por `SearchTarget`, processamento idempotente e outbox transacional.

Permanecem pendentes de validação comercial ou técnica: provedor inicial de voos, canal inicial de notificação, modelo de monetização, intervalos finais de monitoramento, política de retenção de observações e metas definitivas de SLO.

## Critério para começar a implementação

O código somente deve ser iniciado depois de:

- aprovação explícita do escopo do MVP;
- validação da viabilidade e dos termos do provedor de voos;
- definição do canal inicial de notificação;
- transformação das questões abertas críticas em decisões ou experimentos controlados;
- aprovação da `SPEC-001` e dos evals associados.
