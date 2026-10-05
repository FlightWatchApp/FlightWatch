# Documentação — Flight Watch

Fonte de verdade do produto, do domínio e da arquitetura. O código implementa o
que está aqui; quando divergirem, o documento desatualizado é corrigido no mesmo
conjunto de alterações.

## Ordem de leitura

1. [`PRODUCT.md`](./PRODUCT.md) — visão, público, escopo do MVP e limites.
2. [`DOMAIN.md`](./DOMAIN.md) — entidades, estados, invariantes e glossário.
3. [`ARCHITECTURE.md`](./ARCHITECTURE.md) — componentes, fluxos, dados e operação.
4. [`adr/`](./adr/) — decisões arquiteturais e alternativas descartadas.
5. [`EVALS.md`](./EVALS.md) — cenários objetivos de correção, custo e resiliência.
6. [`QUALITY-GATES.md`](./QUALITY-GATES.md) — condições para aceitar e publicar mudanças.
7. [`specs/`](./specs/) — contrato de cada funcionalidade.
8. [`../AGENTS.md`](../AGENTS.md) e [`../CLAUDE.md`](../CLAUDE.md) — regras para agentes de IA.

## Regra de precedência

Em caso de divergência:

1. a spec da feature rege o comportamento daquela feature;
2. `DOMAIN.md` rege invariantes e regras transversais;
3. ADRs aceitos regem decisões arquiteturais;
4. `ARCHITECTURE.md` apresenta a visão consolidada;
5. `PRODUCT.md` rege escopo e objetivos de negócio.

Nenhuma divergência é resolvida silenciosamente. A ordem completa, incluindo
legislação e contratos externos, está em `CLAUDE.md` §0.2.

## Mapa

| Caminho                                      | Conteúdo                                                                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `PRODUCT.md`, `DOMAIN.md`, `ARCHITECTURE.md` | fundação do produto e do sistema                                                                                       |
| `EVALS.md`, `QUALITY-GATES.md`               | catálogo de evals de domínio e gates de PR/release                                                                     |
| `BRAND.md`, `DESIGN-SYSTEM.md`               | marca (logo, cores, voz) e regras de interface verificadas por `pnpm check:design`                                     |
| `adr/`                                       | ADR-001 a ADR-007                                                                                                      |
| `specs/`                                     | specs que entraram no processo (SPEC-001 a SPEC-023, com lacunas na numeração); o status de cada uma está no cabeçalho |
| `evals/`                                     | evals específicos de uma spec (ex.: EVALS-023 do dashboard)                                                            |
| `roadmap/`                                   | estado atual, visão das próximas fases, roadmap, backlog de specs e visão pós-MVP                                      |
| `roadmap/rascunhos/`                         | rascunhos de spec: escopo completo das fatias já implementadas e specs adiadas (SPEC-017)                              |
| `design-refactor/`                           | refactor web v2: specs de detalhe, decisões (`09-decisoes.md`), progresso, tasks e relatórios de eval                  |
| `reviews/`                                   | code reviews independentes, citados pelas specs que corrigiram seus findings                                           |

Status atual do projeto, bloqueios e decisões pendentes: `CLAUDE.md` §1.

## Registros históricos

Relatórios de eval, tasks concluídas e reviews descrevem o repositório na data
em que foram escritos e não são reescritos. Em 2026-10-05 a documentação foi
reorganizada; caminhos antigos citados nesses registros correspondem a:

| Caminho antigo                                  | Caminho atual             |
| ----------------------------------------------- | ------------------------- |
| `flight-watch-foundation-v0.1/*.md`             | `docs/*.md`               |
| `flight-watch-foundation-v0.1/AGENTS.md`        | `AGENTS.md` (raiz)        |
| `flight-watch-foundation-v0.1/docs/adr/`        | `docs/adr/`               |
| `flight-watch-foundation-v0.1/docs/specs/`      | `docs/specs/`             |
| `flight-watch-next-phases/`                     | `docs/roadmap/`           |
| `flight-watch-next-phases/specs/`               | `docs/roadmap/rascunhos/` |
| `flight-watch-dashboard/SPEC-023-dashboard.md`  | `docs/specs/`             |
| `flight-watch-dashboard/EVALS-023-dashboard.md` | `docs/evals/`             |
| `*-CODE-REVIEW*.md` na raiz                     | `docs/reviews/`           |

As capturas de tela dos evals de navegador (`design-refactor/evals/**/*.png`,
cerca de 8 MB) não são versionadas: os relatórios `.md` descrevem o resultado, e
as imagens ficam só na cópia local de quem executou o eval.
