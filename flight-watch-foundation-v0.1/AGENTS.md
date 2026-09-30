# AGENTS — Regras para desenvolvimento assistido por IA

Estas instruções se aplicam a agentes e pessoas que utilizem agentes neste repositório.

## 1. Fonte de verdade

Antes de alterar código:

1. ler a spec aplicável por inteiro;
2. ler `DOMAIN.md`;
3. ler ADRs relacionados;
4. localizar implementação e testes existentes;
5. declarar lacunas ou conflitos antes de escolher comportamento.

Não inventar requisitos. Quando a spec não cobrir uma decisão que afete contrato, dados, segurança, custo ou comportamento do usuário, interromper a implementação e solicitar decisão ou propor uma alteração documental explícita.

## 2. Unidade de trabalho

- Uma tarefa deve referenciar uma spec e critérios de aceitação.
- Alterações devem ser pequenas, revisáveis e limitadas ao necessário.
- Não realizar refatoração ampla junto de feature sem justificativa e cobertura.
- Não mudar contrato público, schema persistente ou evento sem atualizar spec e testes.
- Não adicionar dependência sem justificar necessidade, licença, manutenção e impacto.

## 3. Fluxo obrigatório

1. Resumir o comportamento requerido e riscos.
2. Mapear arquivos permitidos e afetados.
3. Criar ou ajustar testes que falhem pelo motivo esperado.
4. Implementar o mínimo necessário.
5. Executar os gates aplicáveis.
6. Revisar diff, segurança, observabilidade e migração.
7. Informar resultados reais; nunca alegar teste não executado.

## 4. Regras de domínio invioláveis

- `Watch` e `SearchTarget` são conceitos distintos.
- Pesquisas equivalentes devem convergir para um SearchTarget.
- `PriceObservation` é imutável.
- Dinheiro usa inteiro em unidade mínima e código de moeda.
- Jobs e efeitos externos são idempotentes.
- Falha de provedor não apaga último preço válido.
- Redis não é fonte de verdade de dados de domínio.
- O domínio não importa SDK de provedor, fila, ORM ou framework web.
- Nenhum alerta é enviado sem regra persistida, justificativa e chave idempotente.
- Nenhum log contém token, payload sensível ou contato completo.

## 5. TDD e evals

- Testar comportamento, não detalhes frágeis de implementação.
- Unitários cobrem regras puras e estados.
- Integração cobre banco, índices únicos, transações, outbox e filas.
- Contract tests cobrem adaptadores com fixtures sanitizadas.
- E2E cobre somente jornadas de alto valor.
- Todo bug de produção deve gerar teste ou eval de regressão antes da correção.
- Fixtures externas não podem conter credenciais ou dados pessoais.

## 6. Alterações no banco

- Migrações publicadas nunca são editadas.
- Usar expansão/contração para mudanças incompatíveis.
- Toda migração tem estratégia de rollback ou roll-forward documentada.
- Adicionar índice em tabela grande exige avaliação de lock e tempo.
- Backfill deve ser reiniciável, observável e limitado em lotes.
- Não usar cascade delete sem decisão explícita do domínio.

## 7. Integrações externas

- Acesso somente por interfaces em `packages/providers` ou `packages/notifications`.
- Toda chamada possui timeout, correlação e classificação de erro.
- Retry respeita idempotência e `Retry-After`.
- Não registrar corpo integral por padrão.
- SDK não pode vazar tipos para o domínio.
- Testes normais não consomem cota real; smoke test real é isolado e controlado.

## 8. Segurança

- Validar dados em toda fronteira.
- Autorizar por propriedade do recurso, não apenas por autenticação.
- Não construir SQL, URL ou template com entrada não tratada.
- Segredos não entram em código, fixtures, commits ou mensagens de erro.
- Mudança de autenticação, autorização, criptografia ou retenção exige revisão humana.
- Dependência com vulnerabilidade crítica bloqueia merge, salvo exceção documentada e temporária.

## 9. Observabilidade

Toda feature assíncrona deve fornecer:

- métrica de início, sucesso, falha e duração;
- log estruturado com `correlation_id`;
- código de erro estável;
- evidência de idempotência;
- runbook quando introduzir novo modo de falha operacional.

## 10. Limites de autonomia

| Nível | Permissão                                                      |
| ----- | -------------------------------------------------------------- |
| 0     | analisar e explicar                                            |
| 1     | propor plano e diff, sem editar                                |
| 2     | criar/ajustar testes e documentação                            |
| 3     | implementar uma spec isolada em branch                         |
| 4     | alterar múltiplos módulos dentro de uma spec aprovada          |
| 5     | abrir PR e responder a CI, sem merge                           |
| 6     | corrigir automaticamente falhas classificadas e de baixo risco |

Produção, migrações destrutivas, segredos, billing, políticas de segurança e merge permanecem sob controle humano explícito.

Promoção de autonomia exige histórico mensurável: taxa de gates aprovados, regressões, retrabalho, incidentes e aderência de escopo. Confiança subjetiva não basta.

## 11. Ações proibidas

- desativar teste, lint, typecheck ou gate para obter verde;
- reduzir asserções sem demonstrar mudança legítima de requisito;
- capturar erro e seguir como sucesso;
- adicionar `any`, ignore ou supressão sem justificativa localizada;
- editar migração já aplicada;
- acessar diretamente tabela pertencente a outro módulo para contornar contrato;
- criar alerta ou entrega sem chave idempotente;
- usar LLM para decisão que já possui regra determinística;
- declarar conclusão com testes pendentes ou falhos.

## 12. Formato de conclusão da tarefa

Toda entrega deve registrar:

- spec atendida;
- comportamento implementado;
- arquivos relevantes alterados;
- testes e comandos executados com resultado;
- gates não executados e motivo;
- riscos, decisões e pendências;
- migração, rollout e rollback, quando aplicável.
